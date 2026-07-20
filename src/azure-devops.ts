import { log } from './logging.js';
import { getAzureTimeoutMs } from './config.js';
import { fetchWithTimeout, RequestTimeoutError } from './network.js';
import { withRetry } from './retry.js';
import type { PipelineStatus } from './types.js';

const BASE = 'https://dev.azure.com';
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);
const MAX_LOG_REDIRECTS = 3;

type AzureLogSecurityCode =
  | 'malformed-url'
  | 'https-required'
  | 'userinfo-not-allowed'
  | 'untrusted-origin'
  | 'unexpected-log-path'
  | 'missing-redirect-location'
  | 'cross-origin-redirect'
  | 'redirect-limit-exceeded';

type FetchLike = typeof globalThis.fetch;

let fetchImpl: FetchLike | null = null;

class AzureDevopsRequestError extends Error {
  public constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'AzureDevopsRequestError';
  }
}

class AzureLogSecurityError extends Error {
  public constructor(public readonly code: AzureLogSecurityCode) {
    super(`Azure DevOps log URL rejected: ${code}`);
    this.name = 'AzureLogSecurityError';
  }
}

function getFetchImpl(): FetchLike {
  if (fetchImpl) {
    return fetchImpl;
  }

  if (typeof globalThis.fetch !== 'function') {
    throw new Error('Global fetch is not available in this runtime');
  }

  return globalThis.fetch.bind(globalThis);
}

function encodePathSegment(value: string | number): string {
  return encodeURIComponent(String(value));
}

function buildAzureProjectUrl(
  org: string,
  project: string,
  pathSegments: ReadonlyArray<string | number>,
  query: ReadonlyArray<readonly [string, string | number]> = []
): string {
  const path = [org, project, ...pathSegments].map(encodePathSegment).join('/');
  const url = new URL(`${BASE}/${path}`);

  for (const [key, value] of query) {
    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

function decodePathSegments(url: URL): string[] {
  try {
    return url.pathname
      .split('/')
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment));
  } catch {
    throw new AzureLogSecurityError('malformed-url');
  }
}

function identifiersMatch(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function getLegacyAzureOrigin(org: string): string | null {
  const normalizedOrg = org.toLowerCase();

  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(normalizedOrg)) {
    return null;
  }

  return `https://${normalizedOrg}.visualstudio.com`;
}

function matchesBuildLogPath(segments: string[], prefix: string[], buildId: number): boolean {
  const expected = [...prefix, '_apis', 'build', 'builds', String(buildId), 'logs'];

  const logId = segments.at(-1);

  if (segments.length !== expected.length + 1 || !logId || !/^\d+$/.test(logId)) {
    return false;
  }

  return expected.every((segment, index) => {
    const actual = segments[index];
    return actual !== undefined && identifiersMatch(actual, segment);
  });
}

function validateAzureBuildLogUrl(
  logUrl: string,
  org: string,
  project: string,
  buildId: number
): URL {
  let parsed: URL;

  try {
    parsed = new URL(logUrl);
  } catch {
    throw new AzureLogSecurityError('malformed-url');
  }

  if (parsed.protocol !== 'https:') {
    throw new AzureLogSecurityError('https-required');
  }

  if (parsed.username || parsed.password) {
    throw new AzureLogSecurityError('userinfo-not-allowed');
  }

  const segments = decodePathSegments(parsed);
  const modernOrigin = parsed.origin === BASE;
  const legacyOrigin = getLegacyAzureOrigin(org);
  const legacyMatch = legacyOrigin !== null && parsed.origin === legacyOrigin;

  if (!modernOrigin && !legacyMatch) {
    throw new AzureLogSecurityError('untrusted-origin');
  }

  const prefix = modernOrigin ? [org, project] : [project];

  if (!matchesBuildLogPath(segments, prefix, buildId)) {
    throw new AzureLogSecurityError('unexpected-log-path');
  }

  return parsed;
}

function isRetryableAzureError(error: unknown): boolean {
  if (error instanceof RequestTimeoutError || error instanceof AzureLogSecurityError) {
    return false;
  }

  if (error instanceof AzureDevopsRequestError) {
    return RETRYABLE_STATUS_CODES.has(error.status);
  }

  return error instanceof Error;
}

async function azureGet(url: string, pat: string): Promise<unknown> {
  return withRetry(
    async () => {
      const response = await fetchWithTimeout(
        getFetchImpl(),
        url,
        {
          headers: {
            Authorization: `Basic ${Buffer.from(`:${pat}`, 'utf8').toString('base64')}`,
            'Content-Type': 'application/json'
          }
        },
        getAzureTimeoutMs(),
        'Azure DevOps request timed out'
      );

      if (!response.ok) {
        throw new AzureDevopsRequestError(
          `Azure DevOps API error: ${response.status} ${response.statusText} - ${url}`,
          response.status
        );
      }

      return response.json();
    },
    {
      attempts: 3,
      jitterRatio: 0.2,
      shouldRetry: isRetryableAzureError
    }
  );
}

async function fetchAzureLogText(
  logUrl: string,
  authHeader: string,
  org: string,
  project: string,
  buildId: number
): Promise<string> {
  return withRetry(
    async () => {
      let currentUrl = validateAzureBuildLogUrl(logUrl, org, project, buildId);
      let redirectsFollowed = 0;

      while (true) {
        const response = await fetchWithTimeout(
          getFetchImpl(),
          currentUrl,
          {
            headers: {
              Authorization: authHeader
            },
            redirect: 'manual'
          },
          getAzureTimeoutMs(),
          'Azure DevOps request timed out'
        );

        if (REDIRECT_STATUS_CODES.has(response.status)) {
          if (redirectsFollowed >= MAX_LOG_REDIRECTS) {
            throw new AzureLogSecurityError('redirect-limit-exceeded');
          }

          const location = response.headers.get('location');

          if (!location) {
            throw new AzureLogSecurityError('missing-redirect-location');
          }

          let nextUrl: URL;

          try {
            nextUrl = new URL(location, currentUrl);
          } catch {
            throw new AzureLogSecurityError('malformed-url');
          }

          if (nextUrl.origin !== currentUrl.origin) {
            throw new AzureLogSecurityError('cross-origin-redirect');
          }

          currentUrl = validateAzureBuildLogUrl(nextUrl.toString(), org, project, buildId);
          redirectsFollowed += 1;
          continue;
        }

        if (!response.ok) {
          throw new AzureDevopsRequestError(
            `Azure DevOps log error: ${response.status} ${response.statusText}`,
            response.status
          );
        }

        return response.text();
      }
    },
    {
      attempts: 3,
      jitterRatio: 0.2,
      shouldRetry: isRetryableAzureError
    }
  );
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getNestedString(value: Record<string, unknown>, ...path: string[]): string | null {
  let current: unknown = value;
  for (const key of path) {
    current = asObject(current)[key];
  }
  return asString(current);
}

export async function listPipelines(
  org: string,
  project: string,
  pat: string
): Promise<Array<{ id: number | null; name: string }>> {
  const url = buildAzureProjectUrl(org, project, ['_apis', 'pipelines'], [['api-version', '7.1']]);
  const data = asObject(await azureGet(url, pat));
  const value = Array.isArray(data.value) ? data.value : [];

  return value
    .map((item) => {
      const record = asObject(item);
      const name = asString(record.name);

      if (!name) {
        return null;
      }

      return {
        id: asNumber(record.id),
        name
      };
    })
    .filter((item): item is { id: number | null; name: string } => item !== null);
}

export async function getLatestRun(
  org: string,
  project: string,
  pipelineId: number,
  pat: string
): Promise<PipelineStatus | null> {
  try {
    const url = buildAzureProjectUrl(
      org,
      project,
      ['_apis', 'build', 'builds'],
      [
        ['definitions', pipelineId],
        ['$top', 1],
        ['api-version', '7.1']
      ]
    );
    const data = asObject(await azureGet(url, pat));
    const build = Array.isArray(data.value) ? asObject(data.value[0]) : {};

    if (!Object.keys(build).length) {
      return null;
    }

    const id = asNumber(build.id);
    const definitionName = getNestedString(build, 'definition', 'name');
    const buildNumber = asString(build.buildNumber);

    if (id === null || !definitionName || !buildNumber) {
      return null;
    }

    return {
      name: definitionName,
      id,
      status: mapStatus(asString(build.status), asString(build.result)),
      result: asString(build.result),
      build_number: buildNumber,
      source_branch: (asString(build.sourceBranch) ?? '').replace('refs/heads/', ''),
      start_time: asString(build.startTime),
      finish_time: asString(build.finishTime),
      requested_by: getNestedString(build, 'requestedFor', 'displayName') ?? 'unknown',
      url: buildAzureProjectUrl(org, project, ['_build', 'results'], [['buildId', id]])
    };
  } catch (error) {
    log('error', 'Failed to get latest run', { pipelineId, error: String(error) });
    return null;
  }
}

export async function getPipelineLogs(
  org: string,
  project: string,
  buildId: number,
  pat: string,
  failedOnly: boolean
): Promise<string> {
  const timelineUrl = buildAzureProjectUrl(
    org,
    project,
    ['_apis', 'build', 'builds', buildId, 'timeline'],
    [['api-version', '7.1']]
  );
  const timeline = asObject(await azureGet(timelineUrl, pat));
  const records = Array.isArray(timeline.records) ? timeline.records.map(asObject) : [];
  const selected = records.filter((record) =>
    failedOnly
      ? asString(record.result) === 'failed' && getNestedString(record, 'log', 'url')
      : getNestedString(record, 'log', 'url')
  );

  if (!selected.length) {
    return 'No failed steps found or logs not available yet.';
  }

  const authHeader = `Basic ${Buffer.from(`:${pat}`, 'utf8').toString('base64')}`;
  const parts: string[] = [];

  for (const record of selected.slice(0, 5)) {
    const logUrl = getNestedString(record, 'log', 'url');
    const stepName = asString(record.name) ?? 'unknown-step';
    const result = asString(record.result) ?? 'unknown';

    if (!logUrl) {
      continue;
    }

    try {
      const text = await fetchAzureLogText(logUrl, authHeader, org, project, buildId);
      const relevant = text.split('\n').slice(-50).join('\n');
      parts.push(`\n=== ${stepName} (${result}) ===\n${relevant}`);
    } catch (error) {
      if (error instanceof AzureLogSecurityError) {
        log('warn', 'Rejected Azure DevOps log URL', {
          stepName,
          securityCode: error.code
        });
        parts.push(`\n=== ${stepName} - log fetch rejected (${error.code}) ===`);
      } else {
        parts.push(`\n=== ${stepName} - log fetch failed ===`);
      }
    }
  }

  return parts.join('\n');
}

function mapStatus(status: string | null, result: string | null): PipelineStatus['status'] {
  if (status === 'inProgress') {
    return 'inProgress';
  }

  if (status === 'notStarted') {
    return 'notStarted';
  }

  if (status === 'completed') {
    if (result === 'succeeded') {
      return 'succeeded';
    }
    if (result === 'failed') {
      return 'failed';
    }
    if (result === 'canceled') {
      return 'canceled';
    }
  }

  return 'unknown';
}

export function setAzureDevopsFetchForTests(nextFetch: FetchLike): void {
  fetchImpl = nextFetch;
}

export function resetAzureDevopsFetchForTests(): void {
  fetchImpl = null;
}
