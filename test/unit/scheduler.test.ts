import { jest } from '@jest/globals';

import {
  resetSchedulerRuntimeForTests,
  runSchedulerCycle,
  setSchedulerRuntimeForTests,
  startScheduler,
  stopScheduler
} from '../../src/scheduler.js';
import type { RegisteredServer } from '../../src/types.js';

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

describe('scheduler', () => {
  beforeEach(() => {
    resetSchedulerRuntimeForTests();
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
});
