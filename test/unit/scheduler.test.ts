import { jest } from '@jest/globals';

import {
  resetSchedulerRuntimeForTests,
  runSchedulerCycle,
  setSchedulerRuntimeForTests,
  startScheduler,
  stopScheduler
} from '../../src/scheduler.js';
import type {
  GitHubActionsCheckResult,
  GitLabPipelineCheckResult,
  HttpCheckResult,
  RegisteredGitHubActionsTarget,
  RegisteredGitLabPipelineTarget,
  RegisteredHttpTarget,
  RegisteredServer
} from '../../src/types.js';

function createServer(name: string, overrides: Partial<RegisteredServer> = {}): RegisteredServer {
  return {
    name,
    type: 'http',
    url: 'https://example.com/mcp',
    command: null,
    args: [],
    tags: [],
    alert_on_down: true,
    check_interval_minutes: 5,
    created_at: 0,
    last_checked: null,
    last_status: 'unknown',
    last_response_time_ms: null,
    consecutive_failures: 0,
    ...overrides
  };
}

function createGitHubTarget(
  name: string,
  overrides: Partial<RegisteredGitHubActionsTarget> = {}
): RegisteredGitHubActionsTarget {
  return {
    name,
    owner: 'oaslananka',
    repository: 'health-monitor-mcp',
    workflow: 'ci.yml',
    branch: 'main',
    token_env: 'GITHUB_TOKEN',
    tags: [],
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

function githubResult(status: GitHubActionsCheckResult['status'] = 'up'): GitHubActionsCheckResult {
  return {
    status,
    response_time_ms: 25,
    error_message: status === 'up' ? null : 'failed',
    run: {
      id: 123,
      workflow_name: 'CI',
      run_number: 1,
      run_attempt: 1,
      status: 'completed',
      conclusion: status === 'up' ? 'success' : 'failure',
      event: 'push',
      branch: 'main',
      commit_sha: 'abc123',
      url: 'https://github.com/example/actions/runs/123',
      created_at: '2026-07-22T10:00:00Z',
      updated_at: '2026-07-22T10:05:00Z'
    },
    failed_jobs: []
  };
}

function createGitLabTarget(
  name: string,
  overrides: Partial<RegisteredGitLabPipelineTarget> = {}
): RegisteredGitLabPipelineTarget {
  return {
    name,
    base_url: 'https://gitlab.com',
    project: 'group/project',
    ref: 'main',
    token_env: 'GITLAB_TOKEN',
    tags: [],
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

function gitlabResult(
  status: GitLabPipelineCheckResult['status'] = 'up'
): GitLabPipelineCheckResult {
  return {
    status,
    response_time_ms: 30,
    error_message: status === 'up' ? null : 'failed',
    pipeline: {
      id: 900,
      iid: 45,
      status: status === 'up' ? 'success' : 'failed',
      ref: 'main',
      commit_sha: 'abc123',
      source: 'push',
      url: 'https://gitlab.com/group/project/-/pipelines/900',
      created_at: '2026-07-22T10:00:00Z',
      updated_at: '2026-07-22T10:05:00Z'
    },
    failed_jobs: []
  };
}

function createHttpTarget(
  name: string,
  overrides: Partial<RegisteredHttpTarget> = {}
): RegisteredHttpTarget {
  return {
    name,
    url: 'https://example.com/health',
    expected_statuses: [200],
    header_assertions: [],
    body_contains: [],
    json_assertions: [],
    tls_expiry_days: null,
    tags: [],
    check_interval_minutes: 5,
    created_at: 0,
    last_checked: null,
    last_status: 'unknown',
    last_response_time_ms: null,
    last_status_code: null,
    last_final_url: null,
    last_tls_days_remaining: null,
    last_failed_assertion_count: 0,
    consecutive_failures: 0,
    ...overrides
  };
}

function httpResult(status: HttpCheckResult['status'] = 'up'): HttpCheckResult {
  return {
    status,
    response_time_ms: 35,
    error_message: status === 'up' ? null : 'failed',
    response: {
      status_code: status === 'up' ? 200 : 503,
      final_url: 'https://example.com/health',
      redirect_count: 0,
      content_type: 'application/json',
      content_length: 18,
      tls: null
    },
    assertions: []
  };
}

describe('scheduler', () => {
  beforeEach(() => {
    resetSchedulerRuntimeForTests();
    setSchedulerRuntimeForTests({
      listGitHubActionsTargets: () => [],
      listGitLabPipelineTargets: () => [],
      listHttpTargets: () => []
    });
    delete process.env.HEALTH_MONITOR_MAX_CONCURRENCY;
  });

  afterEach(() => {
    stopScheduler();
    resetSchedulerRuntimeForTests();
    jest.useRealTimers();
    delete process.env.HEALTH_MONITOR_MAX_CONCURRENCY;
  });

  it('checks only due servers in a scheduler cycle', async () => {
    const checkServer = jest.fn(async () => ({
      status: 'up' as const,
      response_time_ms: 42,
      tool_count: 1,
      error_message: null,
      tools: ['health']
    }));
    const recordHealthCheck = jest.fn();

    setSchedulerRuntimeForTests({
      listRegisteredServers: () => [
        createServer('due-server', { last_checked: null }),
        createServer('fresh-server', { last_checked: 9_000, check_interval_minutes: 5 })
      ],
      checkServer,
      recordHealthCheck,
      now: () => 10_000,
      log: jest.fn() as unknown as typeof console.log
    });

    await runSchedulerCycle();

    expect(checkServer).toHaveBeenCalledTimes(1);
    expect(recordHealthCheck).toHaveBeenCalledWith(
      'due-server',
      expect.objectContaining({ status: 'up' })
    );
  });

  it('does not create duplicate intervals when started twice', async () => {
    jest.useFakeTimers();

    const checkServer = jest.fn(async () => ({
      status: 'up' as const,
      response_time_ms: 50,
      tool_count: 1,
      error_message: null,
      tools: ['health']
    }));

    setSchedulerRuntimeForTests({
      listRegisteredServers: () => [createServer('loop-server')],
      checkServer,
      recordHealthCheck: jest.fn(),
      now: () => 0,
      log: jest.fn() as unknown as typeof console.log
    });

    startScheduler(1_000);
    startScheduler(1_000);

    await Promise.resolve();
    expect(checkServer).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1_000);
    expect(checkServer).toHaveBeenCalledTimes(2);
  });

  it('limits concurrent scheduled checks', async () => {
    process.env.HEALTH_MONITOR_MAX_CONCURRENCY = '2';
    let active = 0;
    let maxActive = 0;
    let releaseChecks: () => void = () => undefined;
    const releasePromise = new Promise<void>((resolve) => {
      releaseChecks = resolve;
    });

    const checkServer = jest.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await releasePromise;
      active -= 1;
      return {
        status: 'up' as const,
        response_time_ms: 50,
        tool_count: 1,
        error_message: null,
        tools: ['health']
      };
    });

    setSchedulerRuntimeForTests({
      listRegisteredServers: () =>
        Array.from({ length: 5 }, (_, index) => createServer(`server-${index}`)),
      checkServer,
      recordHealthCheck: jest.fn(),
      now: () => 0,
      log: jest.fn() as unknown as typeof console.log
    });

    const cycle = runSchedulerCycle();
    await Promise.resolve();

    expect(checkServer).toHaveBeenCalledTimes(2);
    expect(maxActive).toBe(2);

    releaseChecks();
    await cycle;

    expect(checkServer).toHaveBeenCalledTimes(5);
    expect(maxActive).toBe(2);
  });

  it('returns without work when no servers are due', async () => {
    const checkServer = jest.fn(async () => ({
      status: 'up' as const,
      response_time_ms: 50,
      tool_count: 1,
      error_message: null,
      tools: ['health']
    }));

    setSchedulerRuntimeForTests({
      listRegisteredServers: () => [createServer('fresh-server', { last_checked: 9_000 })],
      checkServer,
      recordHealthCheck: jest.fn(),
      now: () => 10_000,
      log: jest.fn() as unknown as typeof console.log
    });

    await runSchedulerCycle();

    expect(checkServer).not.toHaveBeenCalled();
  });

  it('logs worker failures without recording a health check', async () => {
    const recordHealthCheck = jest.fn();
    const logMock = jest.fn() as unknown as typeof console.log;

    setSchedulerRuntimeForTests({
      listRegisteredServers: () => [createServer('broken-server')],
      checkServer: jest.fn(async () => {
        throw new Error('boom');
      }),
      recordHealthCheck,
      now: () => 0,
      log: logMock
    });

    await runSchedulerCycle();

    expect(recordHealthCheck).not.toHaveBeenCalled();
    expect(logMock).toHaveBeenCalledWith(
      'error',
      'Scheduled check failed',
      expect.objectContaining({ name: 'broken-server', error: 'boom' })
    );
  });

  it('isolates an HTTP scheduler rejection without recording a check', async () => {
    const recordHttpCheck = jest.fn();
    const logMock = jest.fn() as unknown as typeof console.log;

    setSchedulerRuntimeForTests({
      listRegisteredServers: () => [],
      listGitHubActionsTargets: () => [],
      listGitLabPipelineTargets: () => [],
      listHttpTargets: () => [createHttpTarget('broken-http')],
      checkHttpTarget: jest.fn(async () => {
        throw new Error('http boom');
      }),
      recordHttpCheck,
      now: () => 0,
      log: logMock
    });

    await runSchedulerCycle();

    expect(recordHttpCheck).not.toHaveBeenCalled();
    expect(logMock).toHaveBeenCalledWith(
      'error',
      'Scheduled check failed',
      expect.objectContaining({ kind: 'http_target', name: 'broken-http', error: 'http boom' })
    );
  });

  it('passes scheduler stdio policy into scheduled checks', async () => {
    const checkServer = jest.fn(async () => ({
      status: 'up' as const,
      response_time_ms: 50,
      tool_count: 1,
      error_message: null,
      tools: ['health']
    }));

    setSchedulerRuntimeForTests({
      listRegisteredServers: () => [createServer('stdio-policy-server')],
      checkServer,
      recordHealthCheck: jest.fn(),
      now: () => 0,
      log: jest.fn() as unknown as typeof console.log
    });

    startScheduler(1_000, { allowStdio: false });
    await Promise.resolve();

    expect(checkServer).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'stdio-policy-server' }),
      8_000,
      { allowStdio: false }
    );
  });

  it('checks due MCP, GitHub, GitLab, and HTTP targets and records provider-specific results', async () => {
    const checkServer = jest.fn(async () => ({
      status: 'up' as const,
      response_time_ms: 50,
      tool_count: 1,
      error_message: null,
      tools: ['health']
    }));
    const checkGitHubActionsTarget = jest.fn(async () => githubResult());
    const checkGitLabPipelineTarget = jest.fn(async () => gitlabResult());
    const checkHttpTarget = jest.fn(async () => httpResult());
    const recordHealthCheck = jest.fn();
    const recordGitHubActionsCheck = jest.fn();
    const recordGitLabPipelineCheck = jest.fn();
    const recordHttpCheck = jest.fn();
    const logMock = jest.fn() as unknown as typeof console.log;

    setSchedulerRuntimeForTests({
      listRegisteredServers: () => [
        createServer('mcp-due'),
        createServer('mcp-fresh', { last_checked: 9_000 })
      ],
      listGitHubActionsTargets: () => [
        createGitHubTarget('github-due'),
        createGitHubTarget('github-fresh', { last_checked: 9_000 })
      ],
      listGitLabPipelineTargets: () => [
        createGitLabTarget('gitlab-due'),
        createGitLabTarget('gitlab-fresh', { last_checked: 9_000 })
      ],
      listHttpTargets: () => [
        createHttpTarget('http-due'),
        createHttpTarget('http-fresh', { last_checked: 9_000 })
      ],
      checkServer,
      checkGitHubActionsTarget,
      checkGitLabPipelineTarget,
      checkHttpTarget,
      recordHealthCheck,
      recordGitHubActionsCheck,
      recordGitLabPipelineCheck,
      recordHttpCheck,
      now: () => 10_000,
      log: logMock
    });

    await runSchedulerCycle();

    expect(checkServer).toHaveBeenCalledTimes(1);
    expect(checkGitHubActionsTarget).toHaveBeenCalledTimes(1);
    expect(checkGitLabPipelineTarget).toHaveBeenCalledTimes(1);
    expect(checkHttpTarget).toHaveBeenCalledTimes(1);
    expect(checkHttpTarget).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'http-due' }),
      8_000,
      { profile: 'full' }
    );
    expect(recordHealthCheck).toHaveBeenCalledWith(
      'mcp-due',
      expect.objectContaining({ status: 'up' })
    );
    expect(recordGitHubActionsCheck).toHaveBeenCalledWith(
      'github-due',
      expect.objectContaining({ status: 'up' })
    );
    expect(recordGitLabPipelineCheck).toHaveBeenCalledWith(
      'gitlab-due',
      expect.objectContaining({ status: 'up' })
    );
    expect(recordHttpCheck).toHaveBeenCalledWith(
      'http-due',
      expect.objectContaining({ status: 'up' })
    );
    expect(logMock).toHaveBeenCalledWith(
      'info',
      'Scheduled check complete',
      expect.objectContaining({ kind: 'github_actions', name: 'github-due', status: 'up' })
    );
    expect(logMock).toHaveBeenCalledWith(
      'info',
      'Scheduled check complete',
      expect.objectContaining({ kind: 'gitlab_pipeline', name: 'gitlab-due', status: 'up' })
    );
    expect(logMock).toHaveBeenCalledWith(
      'info',
      'Scheduled check complete',
      expect.objectContaining({ kind: 'http_target', name: 'http-due', status: 'up' })
    );
  });

  it('shares one concurrency limit across MCP, GitHub, GitLab, and HTTP targets', async () => {
    process.env.HEALTH_MONITOR_MAX_CONCURRENCY = '2';
    let active = 0;
    let maxActive = 0;
    let releaseChecks: () => void = () => undefined;
    const releasePromise = new Promise<void>((resolve) => {
      releaseChecks = resolve;
    });
    const enter = async (): Promise<void> => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await releasePromise;
      active -= 1;
    };
    const checkServer = jest.fn(async () => {
      await enter();
      return {
        status: 'up' as const,
        response_time_ms: 50,
        tool_count: 1,
        error_message: null,
        tools: ['health']
      };
    });
    const checkGitHubActionsTarget = jest.fn(async () => {
      await enter();
      return githubResult();
    });
    const checkGitLabPipelineTarget = jest.fn(async () => {
      await enter();
      return gitlabResult();
    });
    const checkHttpTarget = jest.fn(async () => {
      await enter();
      return httpResult();
    });

    setSchedulerRuntimeForTests({
      listRegisteredServers: () => [createServer('mcp-1'), createServer('mcp-2')],
      listGitHubActionsTargets: () => [
        createGitHubTarget('github-1'),
        createGitHubTarget('github-2')
      ],
      listGitLabPipelineTargets: () => [
        createGitLabTarget('gitlab-1'),
        createGitLabTarget('gitlab-2')
      ],
      listHttpTargets: () => [createHttpTarget('http-1'), createHttpTarget('http-2')],
      checkServer,
      checkGitHubActionsTarget,
      checkGitLabPipelineTarget,
      checkHttpTarget,
      recordHealthCheck: jest.fn(),
      recordGitHubActionsCheck: jest.fn(),
      recordGitLabPipelineCheck: jest.fn(),
      recordHttpCheck: jest.fn(),
      now: () => 0,
      log: jest.fn() as unknown as typeof console.log
    });

    const cycle = runSchedulerCycle();
    await Promise.resolve();
    await Promise.resolve();

    expect(
      checkServer.mock.calls.length +
        checkGitHubActionsTarget.mock.calls.length +
        checkGitLabPipelineTarget.mock.calls.length +
        checkHttpTarget.mock.calls.length
    ).toBe(2);
    expect(maxActive).toBe(2);

    releaseChecks();
    await cycle;

    expect(checkServer).toHaveBeenCalledTimes(2);
    expect(checkGitHubActionsTarget).toHaveBeenCalledTimes(2);
    expect(checkGitLabPipelineTarget).toHaveBeenCalledTimes(2);
    expect(checkHttpTarget).toHaveBeenCalledTimes(2);
    expect(maxActive).toBe(2);
  });
});
