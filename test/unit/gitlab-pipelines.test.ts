import { jest } from '@jest/globals';

import {
  checkGitLabPipelineTarget,
  resetGitLabPipelineRuntimeForTests,
  setGitLabPipelineRuntimeForTests
} from '../../src/gitlab-pipelines.js';
import type { RegisteredGitLabPipelineTarget } from '../../src/types.js';

function createTarget(
  overrides: Partial<RegisteredGitLabPipelineTarget> = {}
): RegisteredGitLabPipelineTarget {
  return {
    name: 'gitlab-ci',
    base_url: 'https://gitlab.com',
    project: 'group/project',
    ref: 'main',
    token_env: 'GITLAB_TOKEN',
    tags: ['production'],
    check_interval_minutes: 5,
    created_at: 0,
    last_checked: null,
    last_status: 'unknown',
    last_response_time_ms: null,
    last_pipeline_id: null,
    last_pipeline_status: null,
    last_pipeline_url: null,
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
    headers: { 'content-type': 'application/json', ...headers }
  });
}

function textResponse(
  payload: string,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(payload, { status, headers: { 'content-type': 'text/plain', ...headers } });
}

function sequenceFetch(...responses: Response[]): typeof fetch {
  return jest.fn(async () => {
    const response = responses.shift();
    if (!response) throw new Error('Unexpected fetch call');
    return response;
  }) as unknown as typeof fetch;
}

function pipeline(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 900,
    iid: 45,
    status: 'success',
    source: 'push',
    ref: 'main',
    sha: 'abc123',
    web_url: 'https://gitlab.com/group/project/-/pipelines/900',
    created_at: '2026-07-22T10:00:00Z',
    updated_at: '2026-07-22T10:05:00Z',
    ...overrides
  };
}

function job(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 501,
    status: 'failed',
    stage: 'test',
    name: 'unit-tests',
    ref: 'main',
    web_url: 'https://gitlab.com/group/project/-/jobs/501',
    started_at: '2026-07-22T10:01:00Z',
    finished_at: '2026-07-22T10:03:00Z',
    commit: { id: 'abc123' },
    ...overrides
  };
}

describe('GitLab pipeline API checker', () => {
  beforeEach(() => resetGitLabPipelineRuntimeForTests());
  afterEach(() => {
    resetGitLabPipelineRuntimeForTests();
    jest.useRealTimers();
  });

  it('checks the latest pipeline with encoded project/ref and environment-only auth', async () => {
    const fetchMock = jest.fn(async () => jsonResponse([pipeline()])) as unknown as typeof fetch;
    setGitLabPipelineRuntimeForTests({
      fetchImpl: fetchMock,
      getEnv: (name) => (name === 'GITLAB_TOKEN' ? 'glpat-super-secret' : undefined)
    });

    const result = await checkGitLabPipelineTarget(createTarget(), 5_000);

    expect(result).toEqual(
      expect.objectContaining({
        status: 'up',
        error_message: null,
        failed_jobs: [],
        pipeline: expect.objectContaining({
          id: 900,
          iid: 45,
          status: 'success',
          ref: 'main',
          commit_sha: 'abc123'
        })
      })
    );
    const [url, init] = (fetchMock as unknown as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://gitlab.com/api/v4/projects/group%2Fproject/pipelines?per_page=1&order_by=id&sort=desc&ref=main'
    );
    expect(new Headers(init.headers).get('private-token')).toBe('glpat-super-secret');
    expect(new Headers(init.headers).get('accept')).toBe('application/json');
  });

  it('returns failed job diagnostics with sanitized bounded trace excerpts', async () => {
    const trace =
      '\u001b[0Ksection_start:1780000000:test[collapsed=true]\r\u001b[0KTests\n' +
      '\u001b[31mAssertion failed\u001b[0m\n' +
      '\u001b[0Ksection_end:1780000001:test\r\u001b[0K';
    const fetchMock = sequenceFetch(
      jsonResponse([pipeline({ status: 'failed' })]),
      jsonResponse([job(), job({ id: 502, name: 'lint', status: 'success' })]),
      textResponse(trace, 206)
    );
    setGitLabPipelineRuntimeForTests({ fetchImpl: fetchMock, getEnv: () => undefined });

    const result = await checkGitLabPipelineTarget(createTarget(), 5_000);

    expect(result.status).toBe('down');
    expect(result.failed_jobs).toEqual([
      expect.objectContaining({
        id: 501,
        name: 'unit-tests',
        stage: 'test',
        status: 'failed',
        ref: 'main',
        commit_sha: 'abc123',
        trace_excerpt: 'Tests\nAssertion failed',
        trace_error: null
      })
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect((fetchMock as unknown as jest.Mock).mock.calls[1]?.[0]).toBe(
      'https://gitlab.com/api/v4/projects/group%2Fproject/pipelines/900/jobs?per_page=100&include_retried=false'
    );
    const [, traceInit] = (fetchMock as unknown as jest.Mock).mock.calls[2] as [
      string,
      RequestInit
    ];
    expect(new Headers(traceInit.headers).get('range')).toBe('bytes=-16384');
  });

  it('keeps a failed pipeline result when an individual trace is unavailable or too large', async () => {
    const fetchMock = sequenceFetch(
      jsonResponse([pipeline({ status: 'failed' })]),
      jsonResponse([job(), job({ id: 502, name: 'second', status: 'canceled' })]),
      textResponse('missing', 404),
      textResponse('x'.repeat(70_000))
    );
    setGitLabPipelineRuntimeForTests({ fetchImpl: fetchMock, getEnv: () => undefined });

    const result = await checkGitLabPipelineTarget(createTarget(), 5_000);

    expect(result.status).toBe('down');
    expect(result.failed_jobs).toEqual([
      expect.objectContaining({
        id: 501,
        trace_excerpt: null,
        trace_error: expect.stringContaining('not found')
      }),
      expect.objectContaining({
        id: 502,
        trace_excerpt: null,
        trace_error: expect.stringContaining('65536')
      })
    ]);
  });

  it('supports unauthenticated public checks and nonterminal pipeline states', async () => {
    const fetchMock = sequenceFetch(jsonResponse([pipeline({ status: 'running' })]));
    setGitLabPipelineRuntimeForTests({ fetchImpl: fetchMock, getEnv: () => undefined });

    const result = await checkGitLabPipelineTarget(createTarget({ ref: null }), 5_000);

    expect(result.status).toBe('up');
    expect(result.pipeline).toEqual(expect.objectContaining({ status: 'running' }));
    const [, init] = (fetchMock as unknown as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).has('private-token')).toBe(false);
  });

  it('returns structured errors for no pipelines, malformed payloads, and unknown statuses', async () => {
    const fetchMock = sequenceFetch(
      jsonResponse([]),
      jsonResponse([{ id: 'bad' }]),
      jsonResponse([pipeline({ status: 'mystery' })])
    );
    setGitLabPipelineRuntimeForTests({ fetchImpl: fetchMock, getEnv: () => undefined });

    const noPipelines = await checkGitLabPipelineTarget(createTarget(), 5_000);
    const malformed = await checkGitLabPipelineTarget(createTarget(), 5_000);
    const unknown = await checkGitLabPipelineTarget(createTarget(), 5_000);

    expect(noPipelines).toEqual(
      expect.objectContaining({
        status: 'error',
        error_message: expect.stringContaining('No pipelines')
      })
    );
    expect(malformed).toEqual(
      expect.objectContaining({
        status: 'error',
        error_message: expect.stringContaining('invalid')
      })
    );
    expect(unknown).toEqual(
      expect.objectContaining({
        status: 'error',
        error_message: expect.stringContaining('unsupported status mystery')
      })
    );
  });

  it('redacts tokens from authentication, authorization, and not-found failures', async () => {
    const secret = 'glpat-super-secret';
    const fetchMock = sequenceFetch(
      jsonResponse({ message: `bad ${secret}` }, 401),
      jsonResponse({ message: `forbidden ${secret}` }, 403),
      jsonResponse({ message: `missing ${secret}` }, 404)
    );
    setGitLabPipelineRuntimeForTests({ fetchImpl: fetchMock, getEnv: () => secret });

    const unauthorized = await checkGitLabPipelineTarget(createTarget(), 5_000);
    const forbidden = await checkGitLabPipelineTarget(createTarget(), 5_000);
    const missing = await checkGitLabPipelineTarget(createTarget(), 5_000);

    expect(unauthorized.error_message).toContain('authentication failed');
    expect(forbidden.error_message).toContain('authorization failed');
    expect(missing.error_message).toContain('not found');
    for (const result of [unauthorized, forbidden, missing]) {
      expect(result.error_message).not.toContain(secret);
    }
  });

  it('retries one rate-limit or server failure and returns the successful pipeline', async () => {
    const fetchMock = sequenceFetch(
      jsonResponse({ message: 'rate limited' }, 429, { 'retry-after': '0' }),
      jsonResponse([pipeline()]),
      jsonResponse({ message: 'temporary' }, 502),
      jsonResponse([pipeline()])
    );
    setGitLabPipelineRuntimeForTests({ fetchImpl: fetchMock, getEnv: () => undefined });

    const afterRateLimit = await checkGitLabPipelineTarget(createTarget(), 5_000);
    const afterServerError = await checkGitLabPipelineTarget(createTarget(), 5_000);

    expect(afterRateLimit.status).toBe('up');
    expect(afterServerError.status).toBe('up');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('returns timeout without leaking an unresolved request', async () => {
    const fetchMock = jest.fn(
      async (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError'))
          );
        })
    ) as unknown as typeof fetch;
    setGitLabPipelineRuntimeForTests({ fetchImpl: fetchMock, getEnv: () => undefined });

    const result = await checkGitLabPipelineTarget(createTarget(), 20);

    expect(result).toEqual(
      expect.objectContaining({
        status: 'timeout',
        error_message: expect.stringContaining('timed out')
      })
    );
  });
});
