import { jest } from '@jest/globals';

import {
  checkGitHubActionsTarget,
  resetGitHubActionsRuntimeForTests,
  setGitHubActionsRuntimeForTests
} from '../../src/github-actions.js';
import type { RegisteredGitHubActionsTarget } from '../../src/types.js';

function createTarget(
  overrides: Partial<RegisteredGitHubActionsTarget> = {}
): RegisteredGitHubActionsTarget {
  return {
    name: 'repo-ci',
    owner: 'oaslananka',
    repository: 'health-monitor-mcp',
    workflow: 'ci.yml',
    branch: 'main',
    token_env: 'GITHUB_TOKEN',
    tags: ['production'],
    check_interval_minutes: 5,
    created_at: 0,
    last_checked: null,
    last_status: 'unknown',
    last_response_time_ms: null,
    last_run_id: null,
    last_conclusion: null,
    last_run_url: null,
    consecutive_failures: 0,
    ...overrides
  };
}

function jsonResponse(
  payload: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json',
      ...headers
    }
  });
}

function sequenceFetch(...responses: Response[]): typeof fetch {
  return jest.fn(async () => {
    const response = responses.shift();
    if (!response) throw new Error('Unexpected fetch call');
    return response;
  }) as unknown as typeof fetch;
}

function workflowRun(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 123,
    name: 'CI',
    run_number: 45,
    run_attempt: 1,
    status: 'completed',
    conclusion: 'success',
    event: 'push',
    head_branch: 'main',
    head_sha: 'abc123',
    html_url: 'https://github.com/oaslananka/health-monitor-mcp/actions/runs/123',
    created_at: '2026-07-22T10:00:00Z',
    updated_at: '2026-07-22T10:05:00Z',
    ...overrides
  };
}

describe('GitHub Actions API checker', () => {
  beforeEach(() => {
    resetGitHubActionsRuntimeForTests();
  });

  afterEach(() => {
    resetGitHubActionsRuntimeForTests();
    jest.useRealTimers();
  });

  it('checks the latest workflow run with encoded filters and environment-only auth', async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse({ total_count: 1, workflow_runs: [workflowRun()] })
    ) as unknown as typeof fetch;

    setGitHubActionsRuntimeForTests({
      fetchImpl: fetchMock,
      getEnv: (name) => (name === 'GITHUB_TOKEN' ? 'secret-token-value' : undefined)
    });

    const result = await checkGitHubActionsTarget(createTarget(), 5_000);

    expect(result).toEqual(
      expect.objectContaining({
        status: 'up',
        error_message: null,
        failed_jobs: [],
        run: expect.objectContaining({
          id: 123,
          workflow_name: 'CI',
          branch: 'main',
          commit_sha: 'abc123',
          conclusion: 'success'
        })
      })
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchMock as unknown as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://api.github.com/repos/oaslananka/health-monitor-mcp/actions/workflows/ci.yml/runs?per_page=1&branch=main'
    );
    expect(new Headers(init.headers).get('accept')).toBe('application/vnd.github+json');
    expect(new Headers(init.headers).get('x-github-api-version')).toBe('2026-03-10');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer secret-token-value');
  });

  it('returns failed job and step diagnostics for a failed run', async () => {
    const responses = [
      jsonResponse({
        total_count: 1,
        workflow_runs: [workflowRun({ conclusion: 'failure' })]
      }),
      jsonResponse({
        total_count: 2,
        jobs: [
          {
            id: 501,
            name: 'test',
            status: 'completed',
            conclusion: 'failure',
            html_url: 'https://github.com/example/actions/runs/123/job/501',
            started_at: '2026-07-22T10:01:00Z',
            completed_at: '2026-07-22T10:03:00Z',
            steps: [
              {
                number: 1,
                name: 'Checkout',
                status: 'completed',
                conclusion: 'success',
                started_at: '2026-07-22T10:01:00Z',
                completed_at: '2026-07-22T10:01:10Z'
              },
              {
                number: 2,
                name: 'Run tests',
                status: 'completed',
                conclusion: 'failure',
                started_at: '2026-07-22T10:01:10Z',
                completed_at: '2026-07-22T10:03:00Z'
              }
            ]
          },
          {
            id: 502,
            name: 'lint',
            status: 'completed',
            conclusion: 'success',
            html_url: 'https://github.com/example/actions/runs/123/job/502',
            started_at: null,
            completed_at: null,
            steps: []
          }
        ]
      })
    ];
    const fetchMock = jest.fn(async () => {
      const response = responses.shift();
      if (!response) throw new Error('Unexpected fetch call');
      return response;
    }) as unknown as typeof fetch;

    setGitHubActionsRuntimeForTests({ fetchImpl: fetchMock, getEnv: () => undefined });

    const result = await checkGitHubActionsTarget(createTarget(), 5_000);

    expect(result.status).toBe('down');
    expect(result.failed_jobs).toEqual([
      expect.objectContaining({
        name: 'test',
        conclusion: 'failure',
        failed_steps: [
          expect.objectContaining({ number: 2, name: 'Run tests', conclusion: 'failure' })
        ]
      })
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock as unknown as jest.Mock).mock.calls[1]?.[0]).toBe(
      'https://api.github.com/repos/oaslananka/health-monitor-mcp/actions/runs/123/jobs?filter=latest&per_page=100'
    );
  });

  it('supports unauthenticated public checks and treats an in-progress run as healthy', async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse({
        total_count: 1,
        workflow_runs: [workflowRun({ status: 'in_progress', conclusion: null })]
      })
    ) as unknown as typeof fetch;
    setGitHubActionsRuntimeForTests({ fetchImpl: fetchMock, getEnv: () => undefined });

    const result = await checkGitHubActionsTarget(createTarget({ branch: null }), 5_000);

    expect(result.status).toBe('up');
    expect(result.run).toEqual(
      expect.objectContaining({ status: 'in_progress', conclusion: null })
    );
    const [, init] = (fetchMock as unknown as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).has('authorization')).toBe(false);
  });

  it('returns structured errors for no runs and malformed payloads', async () => {
    const fetchMock = sequenceFetch(
      jsonResponse({ total_count: 0, workflow_runs: [] }),
      jsonResponse({ workflow_runs: [{ id: 'not-a-number' }] })
    );
    setGitHubActionsRuntimeForTests({ fetchImpl: fetchMock, getEnv: () => undefined });

    const noRuns = await checkGitHubActionsTarget(createTarget(), 5_000);
    const malformed = await checkGitHubActionsTarget(createTarget(), 5_000);

    expect(noRuns).toEqual(
      expect.objectContaining({
        status: 'error',
        error_message: expect.stringContaining('No workflow runs')
      })
    );
    expect(malformed).toEqual(
      expect.objectContaining({
        status: 'error',
        error_message: expect.stringContaining('invalid')
      })
    );
  });

  it('does not expose tokens in authentication and authorization failures', async () => {
    const secret = 'github_pat_super_secret';
    const fetchMock = sequenceFetch(
      jsonResponse({ message: 'Bad credentials' }, 401),
      jsonResponse({ message: 'API rate limit exceeded for github_pat_super_secret' }, 403, {
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': '1780000000'
      })
    );
    setGitHubActionsRuntimeForTests({ fetchImpl: fetchMock, getEnv: () => secret });

    const unauthorized = await checkGitHubActionsTarget(createTarget(), 5_000);
    const rateLimited = await checkGitHubActionsTarget(createTarget(), 5_000);

    expect(unauthorized.status).toBe('error');
    expect(unauthorized.error_message).toContain('authentication failed');
    expect(unauthorized.error_message).not.toContain(secret);
    expect(rateLimited.status).toBe('error');
    expect(rateLimited.error_message).toContain('rate limit');
    expect(rateLimited.error_message).not.toContain(secret);
  });

  it('retries one transient response and returns the successful run', async () => {
    const fetchMock = sequenceFetch(
      jsonResponse({ message: 'temporary' }, 502),
      jsonResponse({ total_count: 1, workflow_runs: [workflowRun()] })
    );
    setGitHubActionsRuntimeForTests({ fetchImpl: fetchMock, getEnv: () => undefined });

    const result = await checkGitHubActionsTarget(createTarget(), 5_000);

    expect(result.status).toBe('up');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns timeout without leaking an unresolved request', async () => {
    const fetchMock = jest.fn(
      async (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        })
    ) as unknown as typeof fetch;
    setGitHubActionsRuntimeForTests({ fetchImpl: fetchMock, getEnv: () => undefined });

    const result = await checkGitHubActionsTarget(createTarget(), 20);

    expect(result).toEqual(
      expect.objectContaining({
        status: 'timeout',
        error_message: expect.stringContaining('timed out')
      })
    );
  });
});
