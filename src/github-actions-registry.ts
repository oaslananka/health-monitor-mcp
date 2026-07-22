import { getRetentionDays } from './config.js';
import { getDb } from './db.js';
import type {
  GitHubActionsCheckRecord,
  GitHubActionsCheckResult,
  GitHubActionsJobDiagnostic,
  ListGitHubActionsInput,
  RegisterGitHubActionsInput,
  RegisteredGitHubActionsTarget
} from './types.js';

type TargetRow = Omit<RegisteredGitHubActionsTarget, 'tags'> & { tags: string };
type StoredCheck = Omit<GitHubActionsCheckRecord, 'failed_jobs'> & {
  failed_jobs: GitHubActionsJobDiagnostic[];
};

export interface GitHubActionsDashboardEntry {
  name: string;
  owner: string;
  repository: string;
  workflow: string;
  branch: string | null;
  current_status: RegisteredGitHubActionsTarget['last_status'];
  latest_conclusion: string | null;
  latest_run_url: string | null;
  uptime_percent: number | null;
  avg_response_time_ms: number | null;
  total_checks: number;
  consecutive_failures: number;
}

function parseStringArray(raw: string | null | undefined): string[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : [];
  } catch {
    return [];
  }
}

function parseFailedJobs(raw: string | null | undefined): GitHubActionsJobDiagnostic[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as GitHubActionsJobDiagnostic[]) : [];
  } catch {
    return [];
  }
}

function mapTarget(row: TargetRow | undefined): RegisteredGitHubActionsTarget | null {
  return row ? { ...row, tags: parseStringArray(row.tags) } : null;
}

function listableStatus(
  status: RegisteredGitHubActionsTarget['last_status']
): 'up' | 'down' | 'unknown' {
  return status === 'up' ? 'up' : status === 'unknown' ? 'unknown' : 'down';
}

export function registerGitHubActionsTarget(input: RegisterGitHubActionsInput): {
  registered: true;
  name: string;
} {
  const now = Date.now();
  getDb()
    .prepare(
      `
        INSERT INTO github_actions_targets (
          name, owner, repository, workflow, branch, token_env, tags,
          check_interval_minutes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET
          owner = excluded.owner,
          repository = excluded.repository,
          workflow = excluded.workflow,
          branch = excluded.branch,
          token_env = excluded.token_env,
          tags = excluded.tags,
          check_interval_minutes = excluded.check_interval_minutes
      `
    )
    .run(
      input.name,
      input.owner,
      input.repository,
      input.workflow,
      input.branch ?? null,
      input.token_env,
      JSON.stringify(input.tags),
      input.check_interval_minutes,
      now
    );

  return { registered: true, name: input.name };
}

export function unregisterGitHubActionsTarget(name: string): { unregistered: true; name: string } {
  getDb().prepare('DELETE FROM github_actions_targets WHERE name = ?').run(name);
  return { unregistered: true, name };
}

export function getGitHubActionsTarget(name: string): RegisteredGitHubActionsTarget | null {
  const row = getDb().prepare('SELECT * FROM github_actions_targets WHERE name = ?').get(name) as
    | TargetRow
    | undefined;
  return mapTarget(row);
}

export function listGitHubActionsTargets(
  options: ListGitHubActionsInput = {}
): RegisteredGitHubActionsTarget[] {
  const rows = getDb()
    .prepare('SELECT * FROM github_actions_targets ORDER BY name ASC')
    .all() as TargetRow[];

  return rows
    .map((row) => mapTarget(row))
    .filter((row): row is RegisteredGitHubActionsTarget => row !== null)
    .filter((target) => {
      if (options.tags?.length && !options.tags.some((tag) => target.tags.includes(tag))) {
        return false;
      }

      return !options.status || listableStatus(target.last_status) === options.status;
    });
}

export function recordGitHubActionsCheck(
  targetName: string,
  result: GitHubActionsCheckResult,
  now = Date.now()
): void {
  const db = getDb();
  const target = getGitHubActionsTarget(targetName);
  const consecutiveFailures = result.status === 'up' ? 0 : (target?.consecutive_failures ?? 0) + 1;

  const save = db.transaction(() => {
    db.prepare(
      `
        INSERT INTO github_actions_checks (
          target_name, timestamp, status, response_time_ms, run_id,
          workflow_name, run_number, run_attempt, run_status, conclusion,
          event, branch, commit_sha, run_url, error_message, failed_jobs
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      targetName,
      now,
      result.status,
      result.response_time_ms,
      result.run?.id ?? null,
      result.run?.workflow_name ?? null,
      result.run?.run_number ?? null,
      result.run?.run_attempt ?? null,
      result.run?.status ?? null,
      result.run?.conclusion ?? null,
      result.run?.event ?? null,
      result.run?.branch ?? null,
      result.run?.commit_sha ?? null,
      result.run?.url ?? null,
      result.error_message,
      JSON.stringify(result.failed_jobs)
    );

    db.prepare(
      `
        UPDATE github_actions_targets
        SET last_checked = ?,
            last_status = ?,
            last_response_time_ms = ?,
            last_run_id = ?,
            last_conclusion = ?,
            last_run_url = ?,
            consecutive_failures = ?
        WHERE name = ?
      `
    ).run(
      now,
      result.status,
      result.response_time_ms,
      result.run?.id ?? null,
      result.run?.conclusion ?? null,
      result.run?.url ?? null,
      consecutiveFailures,
      targetName
    );
  });

  save();
  pruneGitHubActionsChecks(now);
}

export function getLatestGitHubActionsCheck(targetName: string): StoredCheck | null {
  const row = getDb()
    .prepare(
      `
        SELECT *
        FROM github_actions_checks
        WHERE target_name = ?
        ORDER BY timestamp DESC, id DESC
        LIMIT 1
      `
    )
    .get(targetName) as GitHubActionsCheckRecord | undefined;

  return row ? { ...row, failed_jobs: parseFailedJobs(row.failed_jobs) } : null;
}

export function pruneGitHubActionsChecks(now = Date.now()): number {
  const cutoff = now - getRetentionDays() * 24 * 60 * 60 * 1000;
  return getDb()
    .prepare(
      `
        DELETE FROM github_actions_checks
        WHERE id IN (
          SELECT id
          FROM github_actions_checks
          WHERE timestamp < ?
          ORDER BY timestamp ASC, id ASC
          LIMIT 1000
        )
      `
    )
    .run(cutoff).changes;
}

export function getGitHubActionsDashboardReport(
  hours: number,
  now = Date.now()
): GitHubActionsDashboardEntry[] {
  const db = getDb();
  const since = now - hours * 60 * 60 * 1000;
  const targets = db
    .prepare('SELECT * FROM github_actions_targets ORDER BY name ASC')
    .all() as TargetRow[];
  const checks = db
    .prepare(
      `
        SELECT target_name, status, response_time_ms
        FROM github_actions_checks
        WHERE timestamp > ?
        ORDER BY target_name ASC, timestamp DESC, id DESC
      `
    )
    .all(since) as Array<{
    target_name: string;
    status: GitHubActionsCheckResult['status'];
    response_time_ms: number | null;
  }>;
  const checksByTarget = new Map<string, typeof checks>();

  for (const check of checks) {
    const targetChecks = checksByTarget.get(check.target_name) ?? [];
    targetChecks.push(check);
    checksByTarget.set(check.target_name, targetChecks);
  }

  return targets.map((row) => {
    const target = mapTarget(row)!;
    const targetChecks = checksByTarget.get(target.name) ?? [];
    const responseTimes = targetChecks
      .map((check) => check.response_time_ms)
      .filter((value): value is number => value !== null);
    const upCount = targetChecks.filter((check) => check.status === 'up').length;

    return {
      name: target.name,
      owner: target.owner,
      repository: target.repository,
      workflow: target.workflow,
      branch: target.branch,
      current_status: target.last_status,
      latest_conclusion: target.last_conclusion,
      latest_run_url: target.last_run_url,
      uptime_percent:
        targetChecks.length > 0 ? Math.round((upCount / targetChecks.length) * 100) : null,
      avg_response_time_ms:
        responseTimes.length > 0
          ? Math.round(responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length)
          : null,
      total_checks: targetChecks.length,
      consecutive_failures: target.consecutive_failures
    };
  });
}
