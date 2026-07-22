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
  RegisteredGitHubActionsTarget,
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

describe('scheduler', () => {
  beforeEach(() => {
    resetSchedulerRuntimeForTests();
    setSchedulerRuntimeForTests({ listGitHubActionsTargets: () => [] });
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

  it('checks due MCP and GitHub targets and records provider-specific results', async () => {
    const checkServer = jest.fn(async () => ({
      status: 'up' as const,
      response_time_ms: 50,
      tool_count: 1,
      error_message: null,
      tools: ['health']
    }));
    const checkGitHubActionsTarget = jest.fn(async () => githubResult());
    const recordHealthCheck = jest.fn();
    const recordGitHubActionsCheck = jest.fn();
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
      checkServer,
      checkGitHubActionsTarget,
      recordHealthCheck,
      recordGitHubActionsCheck,
      now: () => 10_000,
      log: logMock
    });

    await runSchedulerCycle();

    expect(checkServer).toHaveBeenCalledTimes(1);
    expect(checkGitHubActionsTarget).toHaveBeenCalledTimes(1);
    expect(recordHealthCheck).toHaveBeenCalledWith(
      'mcp-due',
      expect.objectContaining({ status: 'up' })
    );
    expect(recordGitHubActionsCheck).toHaveBeenCalledWith(
      'github-due',
      expect.objectContaining({ status: 'up' })
    );
    expect(logMock).toHaveBeenCalledWith(
      'info',
      'Scheduled check complete',
      expect.objectContaining({ kind: 'github_actions', name: 'github-due', status: 'up' })
    );
  });

  it('shares one concurrency limit across MCP and GitHub targets', async () => {
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

    setSchedulerRuntimeForTests({
      listRegisteredServers: () => [createServer('mcp-1'), createServer('mcp-2')],
      listGitHubActionsTargets: () => [
        createGitHubTarget('github-1'),
        createGitHubTarget('github-2')
      ],
      checkServer,
      checkGitHubActionsTarget,
      recordHealthCheck: jest.fn(),
      recordGitHubActionsCheck: jest.fn(),
      now: () => 0,
      log: jest.fn() as unknown as typeof console.log
    });

    const cycle = runSchedulerCycle();
    await Promise.resolve();
    await Promise.resolve();

    expect(checkServer.mock.calls.length + checkGitHubActionsTarget.mock.calls.length).toBe(2);
    expect(maxActive).toBe(2);

    releaseChecks();
    await cycle;

    expect(checkServer).toHaveBeenCalledTimes(2);
    expect(checkGitHubActionsTarget).toHaveBeenCalledTimes(2);
    expect(maxActive).toBe(2);
  });
});
