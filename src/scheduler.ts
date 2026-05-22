import { getMaxConcurrency } from './config.js';
import { checkServer } from './checker.js';
import { log } from './logging.js';
import { listRegisteredServers, recordHealthCheck } from './registry.js';
import type { CheckResult, RegisteredServer } from './types.js';

interface SchedulerRuntime {
  listRegisteredServers: () => RegisteredServer[];
  checkServer: (
    server: RegisteredServer,
    timeoutMs: number,
    options?: { allowStdio?: boolean | undefined }
  ) => Promise<CheckResult>;
  recordHealthCheck: (serverName: string, result: CheckResult) => void;
  log: typeof log;
  now: () => number;
}

const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 8_000;

const createDefaultRuntime = (): SchedulerRuntime => ({
  listRegisteredServers,
  checkServer,
  recordHealthCheck,
  log,
  now: () => Date.now()
});

let schedulerRuntime: SchedulerRuntime = createDefaultRuntime();
let schedulerTimer: NodeJS.Timeout | null = null;
let schedulerRunning = false;
let schedulerAllowStdio: boolean | undefined;

function isServerDue(server: RegisteredServer, now: number): boolean {
  if (!server.last_checked) {
    return true;
  }

  return now - server.last_checked >= server.check_interval_minutes * 60 * 1000;
}

export async function runSchedulerCycle(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
  if (schedulerRunning) {
    return;
  }

  schedulerRunning = true;

  try {
    const now = schedulerRuntime.now();
    const dueServers = schedulerRuntime
      .listRegisteredServers()
      .filter((server) => isServerDue(server, now));

    if (dueServers.length === 0) {
      return;
    }

    await runWithConcurrency(dueServers, getMaxConcurrency(), async (server) => {
      try {
        const result = await schedulerRuntime.checkServer(server, timeoutMs, {
          allowStdio: schedulerAllowStdio
        });
        schedulerRuntime.recordHealthCheck(server.name, result);
        schedulerRuntime.log('info', 'Scheduled check complete', {
          name: server.name,
          status: result.status
        });
      } catch (error) {
        schedulerRuntime.log('error', 'Scheduled check failed', {
          name: server.name,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });
  } finally {
    schedulerRunning = false;
  }
}

async function runWithConcurrency<T>(
  items: T[],
  maxConcurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let nextIndex = 0;
  const workerCount = Math.min(maxConcurrency, items.length);

  await Promise.allSettled(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const item = items[nextIndex];
        nextIndex += 1;

        if (item !== undefined) {
          await worker(item);
        }
      }
    })
  );
}

export function startScheduler(
  intervalMs = DEFAULT_INTERVAL_MS,
  options: { allowStdio?: boolean } = {}
): void {
  if (schedulerTimer) {
    return;
  }

  schedulerAllowStdio = options.allowStdio;
  schedulerTimer = setInterval(() => {
    void runSchedulerCycle();
  }, intervalMs);

  void runSchedulerCycle();
  schedulerRuntime.log('info', 'Scheduler started', { intervalMs });
}

export function stopScheduler(): void {
  if (!schedulerTimer) {
    return;
  }

  clearInterval(schedulerTimer);
  schedulerTimer = null;
  schedulerAllowStdio = undefined;
  schedulerRuntime.log('info', 'Scheduler stopped');
}

export function setSchedulerRuntimeForTests(overrides: Partial<SchedulerRuntime>): void {
  schedulerRuntime = {
    ...schedulerRuntime,
    ...overrides
  };
}

export function resetSchedulerRuntimeForTests(): void {
  schedulerRuntime = createDefaultRuntime();
  schedulerRunning = false;
  schedulerAllowStdio = undefined;
}
