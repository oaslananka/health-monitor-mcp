import { z } from 'zod/v3';

import { RequestTimeoutError } from './network.js';
import { withRetry } from './retry.js';
import { MONITOR_NAME, MONITOR_VERSION } from './version.js';
import type {
  GitLabJobDiagnostic,
  GitLabPipelineCheckResult,
  GitLabPipelineDetails,
  RegisteredGitLabPipelineTarget
} from './types.js';

const MAX_JSON_RESPONSE_BYTES = 1_000_000;
const MAX_TRACE_RESPONSE_BYTES = 65_536;
const TRACE_RANGE_BYTES = 16_384;
const TRACE_EXCERPT_CHARACTERS = 8_192;
const MAX_FAILED_JOBS = 20;
const ANSI_ESCAPE_PATTERN = new RegExp(
  String.raw`${String.fromCodePoint(27)}\[[0-?]*[ -/]*[@-~]`,
  'g'
);

const successfulStatuses = new Set(['success', 'skipped']);
const failedStatuses = new Set(['failed', 'canceled']);
const nonTerminalStatuses = new Set([
  'created',
  'waiting_for_resource',
  'preparing',
  'waiting_for_callback',
  'pending',
  'running',
  'canceling',
  'manual',
  'scheduled'
]);

const HttpResponseUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  }, 'URL protocol must be HTTP or HTTPS');

const pipelineSchema = z.object({
  id: z.number().int(),
  iid: z.number().int(),
  status: z.string().min(1),
  source: z.string().min(1),
  ref: z.string().min(1),
  sha: z.string().min(1),
  web_url: HttpResponseUrlSchema,
  created_at: z.string().min(1),
  updated_at: z.string().min(1)
});

const pipelineListSchema = z.array(pipelineSchema).max(1);

const jobSchema = z.object({
  id: z.number().int(),
  status: z.string().min(1),
  stage: z.string().min(1),
  name: z.string().min(1),
  ref: z.string().nullable().optional().default(null),
  web_url: HttpResponseUrlSchema,
  started_at: z.string().nullable().optional().default(null),
  finished_at: z.string().nullable().optional().default(null),
  commit: z.object({ id: z.string().min(1) })
});

const pipelineJobsSchema = z.array(jobSchema).max(100);

interface GitLabPipelineRuntime {
  fetchImpl: typeof globalThis.fetch;
  getEnv: (name: string) => string | undefined;
  now: () => number;
}

class GitLabApiError extends Error {
  public constructor(
    message: string,
    public readonly status: number,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = 'GitLabApiError';
  }
}

const createDefaultRuntime = (): GitLabPipelineRuntime => ({
  fetchImpl: globalThis.fetch.bind(globalThis),
  getEnv: (name) => process.env[name],
  now: () => Date.now()
});

let gitlabPipelineRuntime = createDefaultRuntime();

function remainingTimeout(startedAt: number, timeoutMs: number): number {
  return Math.max(1, timeoutMs - (gitlabPipelineRuntime.now() - startedAt));
}

function requestHeaders(token: string | undefined): Headers {
  const headers = new Headers({
    Accept: 'application/json',
    'User-Agent': `${MONITOR_NAME}/${MONITOR_VERSION}`
  });

  if (token) {
    headers.set('PRIVATE-TOKEN', token);
  }

  return headers;
}

function apiError(
  response: Response,
  target: RegisteredGitLabPipelineTarget,
  resource: string
): GitLabApiError {
  const project = `${target.base_url}/${target.project}`;

  if (response.status === 401) {
    return new GitLabApiError(
      `GitLab API authentication failed for ${project}; check ${target.token_env}.`,
      response.status,
      false
    );
  }

  if (response.status === 403) {
    return new GitLabApiError(
      `GitLab API authorization failed for ${project}; the configured token needs read access to pipelines and jobs.`,
      response.status,
      false
    );
  }

  if (response.status === 404) {
    return new GitLabApiError(
      `GitLab ${resource} was not found for ${project}.`,
      response.status,
      false
    );
  }

  if (response.status === 429) {
    return new GitLabApiError(
      `GitLab API rate limit exceeded for ${project}.`,
      response.status,
      true
    );
  }

  return new GitLabApiError(
    `GitLab API request failed with HTTP ${response.status} for ${project}.`,
    response.status,
    response.status >= 500
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

async function withTimedResponse<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  timeoutMessage: string,
  handler: (response: Response) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await gitlabPipelineRuntime.fetchImpl(url, {
      ...init,
      signal: controller.signal
    });
    return await handler(response);
  } catch (error) {
    if (controller.signal.aborted || isAbortError(error)) {
      throw new RequestTimeoutError(timeoutMessage);
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function readBoundedText(
  response: Response,
  maxBytes: number,
  label: string
): Promise<string> {
  const declaredLength = Number.parseInt(response.headers.get('content-length') ?? '', 10);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error(`${label} response exceeds ${maxBytes} bytes`);
  }

  if (!response.body) {
    return '';
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error(`${label} response exceeds ${maxBytes} bytes`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(joined);
}

async function getJson(
  url: string,
  headers: Headers,
  target: RegisteredGitLabPipelineTarget,
  timeoutMs: number,
  label: string
): Promise<unknown> {
  return withTimedResponse(
    url,
    { method: 'GET', headers },
    timeoutMs,
    `GitLab ${label} request timed out`,
    async (response) => {
      if (!response.ok) throw apiError(response, target, label);
      const text = await readBoundedText(response, MAX_JSON_RESPONSE_BYTES, label);
      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new Error(`GitLab ${label} response is invalid JSON`);
      }
    }
  );
}

async function getJsonWithRetry(
  url: string,
  headers: Headers,
  target: RegisteredGitLabPipelineTarget,
  startedAt: number,
  timeoutMs: number,
  label: string
): Promise<unknown> {
  return withRetry(
    () => getJson(url, headers, target, remainingTimeout(startedAt, timeoutMs), label),
    {
      attempts: 2,
      initialDelayMs: 100,
      maxDelayMs: 100,
      shouldRetry: (error) => error instanceof GitLabApiError && error.retryable
    }
  );
}

function projectApiBase(target: RegisteredGitLabPipelineTarget): string {
  return `${target.base_url}/api/v4/projects/${encodeURIComponent(target.project)}`;
}

function pipelineListUrl(target: RegisteredGitLabPipelineTarget): string {
  const query = new URLSearchParams({ per_page: '1', order_by: 'id', sort: 'desc' });
  if (target.ref) query.set('ref', target.ref);
  return `${projectApiBase(target)}/pipelines?${query.toString()}`;
}

function pipelineJobsUrl(target: RegisteredGitLabPipelineTarget, pipelineId: number): string {
  return `${projectApiBase(target)}/pipelines/${pipelineId}/jobs?per_page=100&include_retried=false`;
}

function jobTraceUrl(target: RegisteredGitLabPipelineTarget, jobId: number): string {
  return `${projectApiBase(target)}/jobs/${jobId}/trace`;
}

function mapPipeline(value: z.infer<typeof pipelineSchema>): GitLabPipelineDetails {
  return {
    id: value.id,
    iid: value.iid,
    status: value.status,
    ref: value.ref,
    commit_sha: value.sha,
    source: value.source,
    url: value.web_url,
    created_at: value.created_at,
    updated_at: value.updated_at
  };
}

function resolvePipelineHealth(status: string): GitLabPipelineCheckResult['status'] {
  if (successfulStatuses.has(status) || nonTerminalStatuses.has(status)) return 'up';
  if (failedStatuses.has(status)) return 'down';
  throw new Error(`GitLab pipeline returned unsupported status ${status}.`);
}

function sanitizeTrace(value: string): string {
  const withoutAnsi = value.replace(ANSI_ESCAPE_PATTERN, '');
  const withoutSections = withoutAnsi.replace(/section_(?:start|end):[^\r\n]*\r?/g, '');
  const normalized = withoutSections.replaceAll('\r', '').trim();
  return normalized.slice(-TRACE_EXCERPT_CHARACTERS);
}

async function getTraceExcerpt(
  target: RegisteredGitLabPipelineTarget,
  jobId: number,
  headers: Headers,
  startedAt: number,
  timeoutMs: number
): Promise<{ excerpt: string | null; error: string | null }> {
  const traceHeaders = new Headers(headers);
  traceHeaders.set('Accept', 'text/plain');
  traceHeaders.set('Range', `bytes=-${TRACE_RANGE_BYTES}`);

  try {
    const text = await withRetry(
      () =>
        withTimedResponse(
          jobTraceUrl(target, jobId),
          { method: 'GET', headers: traceHeaders },
          remainingTimeout(startedAt, timeoutMs),
          'GitLab job trace request timed out',
          async (response) => {
            if (!response.ok) throw apiError(response, target, 'job trace');
            return readBoundedText(response, MAX_TRACE_RESPONSE_BYTES, 'GitLab job trace');
          }
        ),
      {
        attempts: 2,
        initialDelayMs: 100,
        maxDelayMs: 100,
        shouldRetry: (error) => error instanceof GitLabApiError && error.retryable
      }
    );
    return { excerpt: sanitizeTrace(text), error: null };
  } catch (error) {
    return {
      excerpt: null,
      error: error instanceof Error ? error.message : 'Unknown GitLab job trace error'
    };
  }
}

async function mapFailedJobs(
  payload: unknown,
  target: RegisteredGitLabPipelineTarget,
  headers: Headers,
  startedAt: number,
  timeoutMs: number
): Promise<GitLabJobDiagnostic[]> {
  const parsed = pipelineJobsSchema.safeParse(payload);
  if (!parsed.success) throw new Error('GitLab pipeline jobs response is invalid');

  const diagnostics: GitLabJobDiagnostic[] = [];
  for (const job of parsed.data
    .filter((entry) => failedStatuses.has(entry.status))
    .slice(0, MAX_FAILED_JOBS)) {
    const trace = await getTraceExcerpt(target, job.id, headers, startedAt, timeoutMs);
    diagnostics.push({
      id: job.id,
      name: job.name,
      stage: job.stage,
      status: job.status,
      ref: job.ref,
      commit_sha: job.commit.id,
      url: job.web_url,
      started_at: job.started_at,
      finished_at: job.finished_at,
      trace_excerpt: trace.excerpt,
      trace_error: trace.error
    });
  }

  return diagnostics;
}

function errorResult(
  status: GitLabPipelineCheckResult['status'],
  message: string,
  startedAt: number
): GitLabPipelineCheckResult {
  return {
    status,
    response_time_ms: gitlabPipelineRuntime.now() - startedAt,
    error_message: message,
    pipeline: null,
    failed_jobs: []
  };
}

export async function checkGitLabPipelineTarget(
  target: RegisteredGitLabPipelineTarget,
  timeoutMs: number
): Promise<GitLabPipelineCheckResult> {
  const startedAt = gitlabPipelineRuntime.now();
  const token = gitlabPipelineRuntime.getEnv(target.token_env)?.trim() || undefined;
  const headers = requestHeaders(token);

  try {
    const payload = await getJsonWithRetry(
      pipelineListUrl(target),
      headers,
      target,
      startedAt,
      timeoutMs,
      'pipeline list'
    );
    const parsed = pipelineListSchema.safeParse(payload);
    if (!parsed.success) throw new Error('GitLab pipeline list response is invalid');

    const latest = parsed.data[0];
    if (!latest) throw new Error(`No pipelines found for ${target.project}.`);

    const pipeline = mapPipeline(latest);
    const status = resolvePipelineHealth(pipeline.status);
    let failedJobs: GitLabJobDiagnostic[] = [];

    if (status === 'down') {
      const jobsPayload = await getJsonWithRetry(
        pipelineJobsUrl(target, pipeline.id),
        headers,
        target,
        startedAt,
        timeoutMs,
        'pipeline jobs'
      );
      failedJobs = await mapFailedJobs(jobsPayload, target, headers, startedAt, timeoutMs);
    }

    return {
      status,
      response_time_ms: gitlabPipelineRuntime.now() - startedAt,
      error_message: null,
      pipeline,
      failed_jobs: failedJobs
    };
  } catch (error) {
    if (error instanceof RequestTimeoutError) {
      return errorResult('timeout', error.message, startedAt);
    }

    return errorResult(
      'error',
      error instanceof Error ? error.message : 'Unknown GitLab pipeline error',
      startedAt
    );
  }
}

/** @internal */
export function setGitLabPipelineRuntimeForTests(overrides: Partial<GitLabPipelineRuntime>): void {
  gitlabPipelineRuntime = { ...gitlabPipelineRuntime, ...overrides };
}

/** @internal */
export function resetGitLabPipelineRuntimeForTests(): void {
  gitlabPipelineRuntime = createDefaultRuntime();
}
