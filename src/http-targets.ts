import * as http from 'node:http';
import * as https from 'node:https';
import type { LookupFunction } from 'node:net';
import { TLSSocket } from 'node:tls';

import type { RuntimeProfile } from './config.js';
import { assertHttpTargetUrlAllowed, type ResolvedHttpTarget } from './http-target-policy.js';
import { RequestTimeoutError } from './network.js';
import type {
  HttpAssertionDiagnostic,
  HttpCheckResult,
  HttpTlsDetails,
  RegisteredHttpTarget
} from './types.js';

const MAX_RESPONSE_BODY_BYTES = 262_144;
const MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export interface HttpTargetRawResponse {
  status_code: number;
  headers: Record<string, string>;
  body: Buffer;
  tls: HttpTlsDetails | null;
}

type HttpTargetRuntime = {
  now: () => number;
  resolve: (url: string, profile: RuntimeProfile) => Promise<ResolvedHttpTarget>;
  request: (
    resolved: ResolvedHttpTarget,
    timeoutMs: number,
    nowMs: number
  ) => Promise<HttpTargetRawResponse>;
};

function normalizeHeaders(headers: http.IncomingHttpHeaders): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (typeof value === 'string') normalized[name.toLowerCase()] = value;
    else if (Array.isArray(value)) normalized[name.toLowerCase()] = value.join(', ');
  }
  return normalized;
}

function parseTlsDetails(socket: TLSSocket, nowMs: number): HttpTlsDetails {
  const certificate = socket.getPeerCertificate();
  if (!certificate?.valid_from || !certificate.valid_to) {
    throw new Error('HTTPS peer certificate details are unavailable.');
  }

  const validFrom = new Date(certificate.valid_from);
  const validTo = new Date(certificate.valid_to);
  if (!Number.isFinite(validFrom.getTime()) || !Number.isFinite(validTo.getTime())) {
    throw new TypeError('HTTPS peer certificate validity dates are invalid.');
  }

  return {
    subject_cn: typeof certificate.subject?.CN === 'string' ? certificate.subject.CN : null,
    issuer_cn: typeof certificate.issuer?.CN === 'string' ? certificate.issuer.CN : null,
    valid_from: validFrom.toISOString(),
    valid_to: validTo.toISOString(),
    days_remaining: Math.floor((validTo.getTime() - nowMs) / (24 * 60 * 60 * 1000))
  };
}

function requestOnce(
  resolved: ResolvedHttpTarget,
  timeoutMs: number,
  nowMs: number
): Promise<HttpTargetRawResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(resolved.url);
    const client = url.protocol === 'https:' ? https : http;
    type PinnedLookupCallback = (
      error: NodeJS.ErrnoException | null,
      address: string | Array<{ address: string; family: number }>,
      family?: number
    ) => void;
    const lookup = ((
      _hostname: string,
      options: number | { all?: boolean },
      callback: PinnedLookupCallback
    ) => {
      if (typeof options === 'object' && options.all) {
        callback(null, [{ address: resolved.selected_address, family: resolved.selected_family }]);
        return;
      }
      callback(null, resolved.selected_address, resolved.selected_family);
    }) as LookupFunction;
    let settled = false;
    let deadlineTimer: NodeJS.Timeout | null = null;

    const clearDeadline = (): void => {
      if (deadlineTimer) {
        clearTimeout(deadlineTimer);
        deadlineTimer = null;
      }
    };

    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      clearDeadline();
      reject(error);
    };

    const request = client.request(
      url,
      {
        method: 'GET',
        agent: false,
        lookup,
        ...(url.protocol === 'https:' ? { servername: resolved.hostname } : {}),
        headers: {
          accept: '*/*',
          'user-agent': 'health-monitor-mcp/http-target'
        }
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;

        response.on('data', (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          size += buffer.length;
          if (size > MAX_RESPONSE_BODY_BYTES) {
            response.destroy(
              new Error(`HTTP response body exceeds ${MAX_RESPONSE_BODY_BYTES} bytes.`)
            );
            return;
          }
          chunks.push(buffer);
        });
        response.on('error', (error) => fail(error));
        response.on('end', () => {
          if (settled) return;
          const statusCode = response.statusCode;
          if (statusCode === undefined) {
            fail(new Error('HTTP response did not include a status code.'));
            return;
          }

          let tls: HttpTlsDetails | null = null;
          if (url.protocol === 'https:') {
            if (!(response.socket instanceof TLSSocket)) {
              fail(new Error('HTTPS response did not use a TLS socket.'));
              return;
            }
            try {
              tls = parseTlsDetails(response.socket, nowMs);
            } catch (error) {
              fail(
                error instanceof Error ? error : new Error('Unable to inspect TLS certificate.')
              );
              return;
            }
          }

          settled = true;
          clearDeadline();
          resolve({
            status_code: statusCode,
            headers: normalizeHeaders(response.headers),
            body: Buffer.concat(chunks),
            tls
          });
        });
      }
    );

    deadlineTimer = setTimeout(() => {
      request.destroy(
        new RequestTimeoutError(`HTTP target request timed out after ${timeoutMs}ms.`)
      );
    }, timeoutMs);
    request.on('error', (error) => fail(error));
    request.end();
  });
}

function createDefaultRuntime(): HttpTargetRuntime {
  return {
    now: Date.now,
    resolve: assertHttpTargetUrlAllowed,
    request: requestOnce
  };
}

let runtime = createDefaultRuntime();

function remainingTimeout(startedAt: number, timeoutMs: number): number {
  const remaining = timeoutMs - (runtime.now() - startedAt);
  if (remaining <= 0) {
    throw new RequestTimeoutError(`HTTP target check timed out after ${timeoutMs}ms.`);
  }
  return remaining;
}

async function withBudget<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  if (timeoutMs <= 0) throw new RequestTimeoutError(message);

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new RequestTimeoutError(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function scalarValue(value: unknown): {
  is_scalar: boolean;
  value: string | number | boolean | null;
} {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
    return { is_scalar: true, value: value as string | number | boolean | null };
  }

  return { is_scalar: false, value: null };
}

function readJsonPath(root: unknown, path: string): { found: boolean; value: unknown } {
  let current = root;
  for (const segment of path.split('.')) {
    if (Array.isArray(current) && /^\d+$/.test(segment)) {
      const index = Number.parseInt(segment, 10);
      if (index >= current.length) return { found: false, value: undefined };
      current = current[index];
      continue;
    }

    if (current === null || typeof current !== 'object' || !Object.hasOwn(current, segment)) {
      return { found: false, value: undefined };
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return { found: true, value: current };
}

function evaluateStatusAssertion(
  target: RegisteredHttpTarget,
  raw: HttpTargetRawResponse
): HttpAssertionDiagnostic {
  const passed = target.expected_statuses.includes(raw.status_code);
  return {
    type: 'status',
    passed,
    path: null,
    expected: target.expected_statuses.join(','),
    actual: raw.status_code,
    message: passed
      ? `HTTP status ${raw.status_code} matched the configured status set.`
      : `HTTP status ${raw.status_code} did not match expected statuses ${target.expected_statuses.join(', ')}.`
  };
}

function evaluateHeaderAssertions(
  target: RegisteredHttpTarget,
  raw: HttpTargetRawResponse
): HttpAssertionDiagnostic[] {
  return target.header_assertions.map((assertion) => {
    const actual = raw.headers[assertion.name.toLowerCase()] ?? null;
    const passed = actual === assertion.equals;
    return {
      type: 'header' as const,
      passed,
      path: assertion.name.toLowerCase(),
      expected: assertion.equals,
      actual,
      message: passed
        ? `Header ${assertion.name} matched.`
        : `Header ${assertion.name} did not match the configured value.`
    };
  });
}

function evaluateBodyAssertions(
  target: RegisteredHttpTarget,
  bodyText: string
): HttpAssertionDiagnostic[] {
  return target.body_contains.map((expected) => {
    const passed = bodyText.includes(expected);
    return {
      type: 'body_contains' as const,
      passed,
      path: null,
      expected,
      actual: passed,
      message: passed
        ? 'Response body contained the configured substring.'
        : 'Response body did not contain the configured substring.'
    };
  });
}

function parseJsonAssertionBody(bodyText: string): unknown {
  try {
    return JSON.parse(bodyText) as unknown;
  } catch {
    throw new Error('HTTP response JSON is invalid for configured JSON assertions.');
  }
}

function evaluateJsonAssertions(
  target: RegisteredHttpTarget,
  bodyText: string
): HttpAssertionDiagnostic[] {
  if (target.json_assertions.length === 0) return [];
  const parsed = parseJsonAssertionBody(bodyText);

  return target.json_assertions.map((assertion) => {
    const result = readJsonPath(parsed, assertion.path);
    const scalar = scalarValue(result.value);
    const passed = result.found && scalar.is_scalar && Object.is(scalar.value, assertion.equals);
    return {
      type: 'json_equals' as const,
      passed,
      path: assertion.path,
      expected: assertion.equals,
      actual: scalar.value,
      message: passed
        ? `JSON path ${assertion.path} matched.`
        : `JSON path ${assertion.path} did not match the configured value.`
    };
  });
}

function evaluateTlsAssertions(
  target: RegisteredHttpTarget,
  raw: HttpTargetRawResponse
): HttpAssertionDiagnostic[] {
  if (target.tls_expiry_days === null) return [];
  if (!raw.tls) throw new Error('TLS expiry monitoring requires an HTTPS response.');

  const passed = raw.tls.days_remaining >= target.tls_expiry_days;
  return [
    {
      type: 'tls_expiry',
      passed,
      path: null,
      expected: target.tls_expiry_days,
      actual: raw.tls.days_remaining,
      message: passed
        ? `TLS certificate remains valid for ${raw.tls.days_remaining} days.`
        : `TLS certificate has ${raw.tls.days_remaining} days remaining, below the ${target.tls_expiry_days}-day threshold.`
    }
  ];
}

function evaluateAssertions(
  target: RegisteredHttpTarget,
  raw: HttpTargetRawResponse
): HttpAssertionDiagnostic[] {
  const bodyText = raw.body.toString('utf8');
  return [
    evaluateStatusAssertion(target, raw),
    ...evaluateHeaderAssertions(target, raw),
    ...evaluateBodyAssertions(target, bodyText),
    ...evaluateJsonAssertions(target, bodyText),
    ...evaluateTlsAssertions(target, raw)
  ];
}

function errorResult(
  status: HttpCheckResult['status'],
  error: unknown,
  startedAt: number,
  response: HttpCheckResult['response'] = null
): HttpCheckResult {
  return {
    status,
    response_time_ms: runtime.now() - startedAt,
    error_message: error instanceof Error ? error.message : 'Unknown HTTP target error',
    response,
    assertions: []
  };
}

export async function checkHttpTarget(
  target: RegisteredHttpTarget,
  timeoutMs: number,
  options: { profile: RuntimeProfile }
): Promise<HttpCheckResult> {
  const startedAt = runtime.now();
  let currentUrl = target.url;
  let redirectCount = 0;

  try {
    while (true) {
      const resolveBudget = remainingTimeout(startedAt, timeoutMs);
      const resolved = await withBudget(
        runtime.resolve(currentUrl, options.profile),
        resolveBudget,
        `HTTP target DNS and policy validation timed out after ${timeoutMs}ms.`
      );
      const requestBudget = remainingTimeout(startedAt, timeoutMs);
      const raw = await runtime.request(resolved, requestBudget, runtime.now());
      const location = raw.headers.location;

      if (REDIRECT_STATUSES.has(raw.status_code) && location) {
        if (redirectCount >= MAX_REDIRECTS) {
          throw new Error(`HTTP redirect limit of ${MAX_REDIRECTS} exceeded.`);
        }
        currentUrl = new URL(location, currentUrl).toString();
        redirectCount += 1;
        continue;
      }

      const response = {
        status_code: raw.status_code,
        final_url: currentUrl,
        redirect_count: redirectCount,
        content_type: raw.headers['content-type'] ?? null,
        content_length: raw.body.length,
        tls: raw.tls
      };

      let assertions: HttpAssertionDiagnostic[];
      try {
        assertions = evaluateAssertions(target, raw);
      } catch (error) {
        return errorResult('error', error, startedAt, response);
      }

      const failed = assertions.filter((assertion) => !assertion.passed);
      return {
        status: failed.length === 0 ? 'up' : 'down',
        response_time_ms: runtime.now() - startedAt,
        error_message: failed[0]?.message ?? null,
        response,
        assertions
      };
    }
  } catch (error) {
    return errorResult(
      error instanceof RequestTimeoutError ? 'timeout' : 'error',
      error,
      startedAt
    );
  }
}

/** @internal */
export function setHttpTargetRuntimeForTests(overrides: Partial<HttpTargetRuntime>): void {
  runtime = { ...runtime, ...overrides };
}

/** @internal */
export function resetHttpTargetRuntimeForTests(): void {
  runtime = createDefaultRuntime();
}
