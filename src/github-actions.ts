import { z } from 'zod/v3';

import { fetchWithTimeout, RequestTimeoutError } from './network.js';
import { withRetry } from './retry.js';
import { MONITOR_NAME, MONITOR_VERSION } from './version.js';
import type {
  GitHubActionsCheckResult,
  GitHubActionsJobDiagnostic,
  GitHubActionsRunDetails,
  RegisteredGitHubActionsTarget
} from './types.js';

const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_API_VERSION = '2026-03-10';
const MAX_RESPONSE_BYTES = 1_000_000;

const successfulConclusions = new Set(['success', 'neutral', 'skipped']);
const failedConclusions = new Set([
  'failure',
  'cancelled',
  'timed_out',
  'action_required',
  'startup_failure',
  'stale'
]);
const failedStepConclusions = new Set(['failure', 'cancelled', 'timed_out', 'action_required']);
const nonTerminalStatuses = new Set(['queued', 'in_progress', 'waiting', 'requested', 'pending']);

const workflowRunSchema = z.object({
  id: z.number().int(),
  name: z.string().min(1),
  run_number: z.number().int(),
  run_attempt: z.number().int().default(1),
  status: z.string().min(1),
  conclusion: z.string().nullable(),
  event: z.string().min(1),
  head_branch: z.string().nullable(),
  head_sha: z.string().min(1),
  html_url: z.string().url(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1)
});

const workflowRunsResponseSchema = z.object({
  total_count: z.number().int().nonnegative().optional(),
  workflow_runs: z.array(workflowRunSchema)
});

const workflowStepSchema = z.object({
  number: z.number().int(),
  name: z.string().min(1),
  status: z.string().min(1),
  conclusion: z.string().nullable(),
  started_at: z.string().nullable().optional().default(null),
  completed_at: z.string().nullable().optional().default(null)
});

const workflowJobSchema = z.object({
  name: z.string().min(1),
  status: z.string().min(1),
  conclusion: z.string().nullable(),
  html_url: z.string().url(),
  started_at: z.string().nullable().optional().default(null),
  completed_at: z.string().nullable().optional().default(null),
  steps: z.array(workflowStepSchema).optional().default([])
});

const workflowJobsResponseSchema = z.object({
  total_count: z.number().int().nonnegative().optional(),
  jobs: z.array(workflowJobSchema).max(100)
});

interface GitHubActionsRuntime {
  fetchImpl: typeof globalThis.fetch;
  getEnv: (name: string) => string | undefined;
  now: () => number;
}

class GitHubApiError extends Error {
  public constructor(
    message: string,
    public readonly status: number,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

const createDefaultRuntime = (): GitHubActionsRuntime => ({
  fetchImpl: globalThis.fetch.bind(globalThis),
  getEnv: (name) => process.env[name],
  now: () => Date.now()
});

let githubActionsRuntime: GitHubActionsRuntime = createDefaultRuntime();

function remainingTimeout(startedAt: number, timeoutMs: number): number {
  return Math.max(1, timeoutMs - (githubActionsRuntime.now() - startedAt));
}

function requestHeaders(token: string | undefined): Headers {
  const headers = new Headers({
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
    'User-Agent': `${MONITOR_NAME}/${MONITOR_VERSION}`
  });

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return headers;
}

function apiError(response: Response, target: RegisteredGitHubActionsTarget): GitHubApiError {
  const repository = `${target.owner}/${target.repository}`;

  if (response.status === 401) {
    return new GitHubApiError(
      `GitHub API authentication failed for ${repository}; check ${target.token_env}.`,
      response.status,
      false
    );
  }

  if (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') {
    const reset = response.headers.get('x-ratelimit-reset');
    const resetMessage = reset ? ` Reset epoch: ${reset}.` : '';
    return new GitHubApiError(
      `GitHub API rate limit exceeded for ${repository}.${resetMessage}`,
      response.status,
      false
    );
  }

  if (response.status === 403) {
    return new GitHubApiError(
      `GitHub API authorization failed for ${repository}; the configured token needs Actions read access.`,
      response.status,
      false
    );
  }

  if (response.status === 404) {
    return new GitHubApiError(
      `GitHub workflow was not found: ${repository} workflow ${target.workflow}.`,
      response.status,
      false
    );
  }

  if (response.status === 429) {
    return new GitHubApiError(
      `GitHub API rate limit exceeded for ${repository}.`,
      response.status,
      true
    );
  }

  return new GitHubApiError(
    `GitHub API request failed with HTTP ${response.status} for ${repository}.`,
    response.status,
    response.status >= 500
  );
}

async function parseJsonResponse(response: Response, label: string): Promise<unknown> {
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) {
    throw new Error(`${label} response exceeds ${MAX_RESPONSE_BYTES} bytes`);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${label} response is invalid JSON`);
  }
}

async function getJson(
  url: string,
  headers: Headers,
  target: RegisteredGitHubActionsTarget,
  timeoutMs: number,
  label: string
): Promise<unknown> {
  const response = await fetchWithTimeout(
    githubActionsRuntime.fetchImpl,
    url,
    { method: 'GET', headers },
    timeoutMs,
    `GitHub Actions ${label} request timed out`
  );

  if (!response.ok) {
    throw apiError(response, target);
  }

  return parseJsonResponse(response, label);
}

async function getJsonWithRetry(
  url: string,
  headers: Headers,
  target: RegisteredGitHubActionsTarget,
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
      shouldRetry: (error) => error instanceof GitHubApiError && error.retryable
    }
  );
}

function mapRun(run: z.infer<typeof workflowRunSchema>): GitHubActionsRunDetails {
  return {
    id: run.id,
    workflow_name: run.name,
    run_number: run.run_number,
    run_attempt: run.run_attempt,
    status: run.status,
    conclusion: run.conclusion,
    event: run.event,
    branch: run.head_branch,
    commit_sha: run.head_sha,
    url: run.html_url,
    created_at: run.created_at,
    updated_at: run.updated_at
  };
}

function mapFailedJobs(payload: unknown): GitHubActionsJobDiagnostic[] {
  const parsed = workflowJobsResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error('GitHub workflow jobs response is invalid');
  }

  return parsed.data.jobs
    .filter((job) => job.conclusion !== null && failedConclusions.has(job.conclusion))
    .map((job) => ({
      name: job.name,
      url: job.html_url,
      status: job.status,
      conclusion: job.conclusion,
      started_at: job.started_at,
      completed_at: job.completed_at,
      failed_steps: job.steps
        .filter((step) => step.conclusion !== null && failedStepConclusions.has(step.conclusion))
        .map((step) => ({
          number: step.number,
          name: step.name,
          status: step.status,
          conclusion: step.conclusion,
          started_at: step.started_at,
          completed_at: step.completed_at
        }))
    }));
}

function workflowRunsUrl(target: RegisteredGitHubActionsTarget): string {
  const owner = encodeURIComponent(target.owner);
  const repository = encodeURIComponent(target.repository);
  const workflow = encodeURIComponent(target.workflow);
  const query = new URLSearchParams({ per_page: '1' });

  if (target.branch) {
    query.set('branch', target.branch);
  }

  return `${GITHUB_API_BASE}/repos/${owner}/${repository}/actions/workflows/${workflow}/runs?${query.toString()}`;
}

function workflowJobsUrl(target: RegisteredGitHubActionsTarget, runId: number): string {
  const owner = encodeURIComponent(target.owner);
  const repository = encodeURIComponent(target.repository);
  return `${GITHUB_API_BASE}/repos/${owner}/${repository}/actions/runs/${runId}/jobs?filter=latest&per_page=100`;
}

function errorResult(
  status: GitHubActionsCheckResult['status'],
  message: string,
  startedAt: number
): GitHubActionsCheckResult {
  return {
    status,
    response_time_ms: githubActionsRuntime.now() - startedAt,
    error_message: message,
    run: null,
    failed_jobs: []
  };
}

export async function checkGitHubActionsTarget(
  target: RegisteredGitHubActionsTarget,
  timeoutMs: number
): Promise<GitHubActionsCheckResult> {
  const startedAt = githubActionsRuntime.now();
  const token = githubActionsRuntime.getEnv(target.token_env)?.trim() || undefined;
  const headers = requestHeaders(token);

  try {
    const payload = await getJsonWithRetry(
      workflowRunsUrl(target),
      headers,
      target,
      startedAt,
      timeoutMs,
      'workflow runs'
    );
    const parsed = workflowRunsResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error('GitHub workflow runs response is invalid');
    }

    const latest = parsed.data.workflow_runs[0];
    if (!latest) {
      throw new Error(
        `No workflow runs found for ${target.owner}/${target.repository} workflow ${target.workflow}.`
      );
    }

    const run = mapRun(latest);
    let failedJobs: GitHubActionsJobDiagnostic[] = [];

    if (run.status === 'completed' && run.conclusion && failedConclusions.has(run.conclusion)) {
      const jobsPayload = await getJsonWithRetry(
        workflowJobsUrl(target, run.id),
        headers,
        target,
        startedAt,
        timeoutMs,
        'workflow jobs'
      );
      failedJobs = mapFailedJobs(jobsPayload);
    }

    let status: GitHubActionsCheckResult['status'];

    if (run.status === 'completed') {
      if (run.conclusion === null) {
        throw new Error('GitHub workflow completed without a conclusion.');
      }

      if (failedConclusions.has(run.conclusion)) {
        status = 'down';
      } else if (successfulConclusions.has(run.conclusion)) {
        status = 'up';
      } else {
        throw new Error(`GitHub workflow returned unsupported conclusion ${run.conclusion}.`);
      }
    } else if (nonTerminalStatuses.has(run.status)) {
      status = 'up';
    } else {
      throw new Error(`GitHub workflow returned unsupported status ${run.status}.`);
    }

    return {
      status,
      response_time_ms: githubActionsRuntime.now() - startedAt,
      error_message: null,
      run,
      failed_jobs: failedJobs
    };
  } catch (error) {
    if (error instanceof RequestTimeoutError) {
      return errorResult('timeout', error.message, startedAt);
    }

    return errorResult(
      'error',
      error instanceof Error ? error.message : 'Unknown GitHub Actions error',
      startedAt
    );
  }
}

/** @internal */
export function setGitHubActionsRuntimeForTests(overrides: Partial<GitHubActionsRuntime>): void {
  githubActionsRuntime = {
    ...githubActionsRuntime,
    ...overrides
  };
}

/** @internal */
export function resetGitHubActionsRuntimeForTests(): void {
  githubActionsRuntime = createDefaultRuntime();
}
