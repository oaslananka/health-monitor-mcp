import { getMaxConcurrency } from './config.js';
import { mapWithConcurrency } from './concurrency.js';
import { checkServer } from './checker.js';
import { checkGitHubActionsTarget } from './github-actions.js';
import { listGitHubActionsTargets, recordGitHubActionsCheck } from './github-actions-registry.js';
import { checkGitLabPipelineTarget } from './gitlab-pipelines.js';
import {
  listGitLabPipelineTargets,
  recordGitLabPipelineCheck
} from './gitlab-pipeline-registry.js';
import { log } from './logging.js';
import { listRegisteredServers, recordHealthCheck } from './registry.js';
import type {
  CheckResult,
  GitHubActionsCheckResult,
  GitLabPipelineCheckResult,
  RegisteredGitHubActionsTarget,
  RegisteredGitLabPipelineTarget,
  RegisteredServer
} from './types.js';

interface SchedulerRuntime {
  listRegisteredServers: () => RegisteredServer[];
  listGitHubActionsTargets: () => RegisteredGitHubActionsTarget[];
  listGitLabPipelineTargets: () => RegisteredGitLabPipelineTarget[];
  checkServer: (
    server: RegisteredServer,
    timeoutMs: number,
    options?: { allowStdio?: boolean | undefined }
  ) => Promise<CheckResult>;
  checkGitHubActionsTarget: (
    target: RegisteredGitHubActionsTarget,
    timeoutMs: number
  ) => Promise<GitHubActionsCheckResult>;
  checkGitLabPipelineTarget: (
    target: RegisteredGitLabPipelineTarget,
    timeoutMs: number
  ) => Promise<GitLabPipelineCheckResult>;
  recordHealthCheck: (serverName: string, result: CheckResult) => void;
  recordGitHubActionsCheck: (targetName: string, result: GitHubActionsCheckResult) => void;
  recordGitLabPipelineCheck: (targetName: string, result: GitLabPipelineCheckResult) => void;
  log: typeof log;
  now: () => number;
}

type ScheduledTarget =
  | { kind: 'mcp_server'; name: string; target: RegisteredServer }
  | { kind: 'github_actions'; name: string; target: RegisteredGitHubActionsTarget }
  | { kind: 'gitlab_pipeline'; name: string; target: RegisteredGitLabPipelineTarget };

const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 8_000;

const createDefaultRuntime = (): SchedulerRuntime => ({
  listRegisteredServers,
  listGitHubActionsTargets: () => listGitHubActionsTargets(),
  listGitLabPipelineTargets: () => listGitLabPipelineTargets(),
  checkServer,
  checkGitHubActionsTarget,
  checkGitLabPipelineTarget,
  recordHealthCheck,
  recordGitHubActionsCheck,
  recordGitLabPipelineCheck,
  log,
  now: () => Date.now()
});

let schedulerRuntime: SchedulerRuntime = createDefaultRuntime();
let schedulerTimer: NodeJS.Timeout | null = null;
let schedulerRunning = false;
let schedulerAllowStdio: boolean | undefined;

function isTargetDue(
  target: Pick<
    RegisteredServer | RegisteredGitHubActionsTarget | RegisteredGitLabPipelineTarget,
    'last_checked' | 'check_interval_minutes'
  >,
  now: number
): boolean {
  if (!target.last_checked) {
    return true;
  }

  return now - target.last_checked >= target.check_interval_minutes * 60 * 1000;
}

export async function runSchedulerCycle(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
  if (schedulerRunning) {
    return;
  }

  schedulerRunning = true;

  try {
    const now = schedulerRuntime.now();
    const dueTargets: ScheduledTarget[] = [
      ...schedulerRuntime
        .listRegisteredServers()
        .filter((server) => isTargetDue(server, now))
        .map((server) => ({ kind: 'mcp_server' as const, name: server.name, target: server })),
      ...schedulerRuntime
        .listGitHubActionsTargets()
        .filter((target) => isTargetDue(target, now))
        .map((target) => ({ kind: 'github_actions' as const, name: target.name, target })),
      ...schedulerRuntime
        .listGitLabPipelineTargets()
        .filter((target) => isTargetDue(target, now))
        .map((target) => ({ kind: 'gitlab_pipeline' as const, name: target.name, target }))
    ];

    if (dueTargets.length === 0) {
      return;
    }

    await mapWithConcurrency(dueTargets, getMaxConcurrency(), async (scheduledTarget) => {
      try {
        if (scheduledTarget.kind === 'mcp_server') {
          const result = await schedulerRuntime.checkServer(scheduledTarget.target, timeoutMs, {
            allowStdio: schedulerAllowStdio
          });
          schedulerRuntime.recordHealthCheck(scheduledTarget.name, result);
          schedulerRuntime.log('info', 'Scheduled check complete', {
            kind: scheduledTarget.kind,
            name: scheduledTarget.name,
            status: result.status
          });
          return;
        }

        if (scheduledTarget.kind === 'github_actions') {
          const result = await schedulerRuntime.checkGitHubActionsTarget(
            scheduledTarget.target,
            timeoutMs
          );
          schedulerRuntime.recordGitHubActionsCheck(scheduledTarget.name, result);
          schedulerRuntime.log('info', 'Scheduled check complete', {
            kind: scheduledTarget.kind,
            name: scheduledTarget.name,
            status: result.status
          });
          return;
        }

        const result = await schedulerRuntime.checkGitLabPipelineTarget(
          scheduledTarget.target,
          timeoutMs
        );
        schedulerRuntime.recordGitLabPipelineCheck(scheduledTarget.name, result);
        schedulerRuntime.log('info', 'Scheduled check complete', {
          kind: scheduledTarget.kind,
          name: scheduledTarget.name,
          status: result.status
        });
      } catch (error) {
        schedulerRuntime.log('error', 'Scheduled check failed', {
          kind: scheduledTarget.kind,
          name: scheduledTarget.name,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });
  } finally {
    schedulerRunning = false;
  }
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
