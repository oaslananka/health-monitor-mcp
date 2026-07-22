import { getRetentionDays } from './config.js';
import { getDb } from './db.js';
import type {
  GitLabJobDiagnostic,
  GitLabPipelineCheckRecord,
  GitLabPipelineCheckResult,
  ListGitLabPipelinesInput,
  RegisterGitLabPipelineInput,
  RegisteredGitLabPipelineTarget
} from './types.js';

type TargetRow = Omit<RegisteredGitLabPipelineTarget, 'project' | 'tags'> & {
  project_path: string;
  tags: string;
};

type StoredCheck = Omit<GitLabPipelineCheckRecord, 'failed_jobs'> & {
  failed_jobs: GitLabJobDiagnostic[];
};

export interface GitLabPipelineDashboardEntry {
  name: string;
  base_url: string;
  project: string;
  ref: string | null;
  current_status: RegisteredGitLabPipelineTarget['last_status'];
  latest_pipeline_status: string | null;
  latest_pipeline_url: string | null;
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

function parseFailedJobs(raw: string | null | undefined): GitLabJobDiagnostic[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as GitLabJobDiagnostic[]) : [];
  } catch {
    return [];
  }
}

function mapTarget(row: TargetRow | undefined): RegisteredGitLabPipelineTarget | null {
  if (!row) return null;

  const { project_path: project, tags, ...rest } = row;
  return {
    ...rest,
    project,
    tags: parseStringArray(tags)
  };
}

function listableStatus(
  status: RegisteredGitLabPipelineTarget['last_status']
): 'up' | 'down' | 'unknown' {
  if (status === 'up' || status === 'unknown') return status;
  return 'down';
}

export function registerGitLabPipelineTarget(input: RegisterGitLabPipelineInput): {
  registered: true;
  name: string;
} {
  const now = Date.now();

  getDb()
    .prepare(
      `
        INSERT INTO gitlab_pipeline_targets (
          name, base_url, project_path, ref, token_env, tags,
          check_interval_minutes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET
          base_url = excluded.base_url,
          project_path = excluded.project_path,
          ref = excluded.ref,
          token_env = excluded.token_env,
          tags = excluded.tags,
          check_interval_minutes = excluded.check_interval_minutes
      `
    )
    .run(
      input.name,
      input.base_url,
      input.project,
      input.ref ?? null,
      input.token_env,
      JSON.stringify(input.tags),
      input.check_interval_minutes,
      now
    );

  return { registered: true, name: input.name };
}

export function unregisterGitLabPipelineTarget(name: string): {
  unregistered: true;
  name: string;
} {
  getDb().prepare('DELETE FROM gitlab_pipeline_targets WHERE name = ?').run(name);
  return { unregistered: true, name };
}

export function getGitLabPipelineTarget(name: string): RegisteredGitLabPipelineTarget | null {
  const row = getDb().prepare('SELECT * FROM gitlab_pipeline_targets WHERE name = ?').get(name) as
    | TargetRow
    | undefined;
  return mapTarget(row);
}

export function listGitLabPipelineTargets(
  options: ListGitLabPipelinesInput = {}
): RegisteredGitLabPipelineTarget[] {
  const rows = getDb()
    .prepare('SELECT * FROM gitlab_pipeline_targets ORDER BY name ASC')
    .all() as TargetRow[];

  return rows
    .map((row) => mapTarget(row))
    .filter((row): row is RegisteredGitLabPipelineTarget => row !== null)
    .filter((target) => {
      if (options.tags?.length && !options.tags.some((tag) => target.tags.includes(tag))) {
        return false;
      }

      return !options.status || listableStatus(target.last_status) === options.status;
    });
}

export function recordGitLabPipelineCheck(
  targetName: string,
  result: GitLabPipelineCheckResult,
  now = Date.now()
): void {
  const db = getDb();
  const target = getGitLabPipelineTarget(targetName);
  const consecutiveFailures = result.status === 'up' ? 0 : (target?.consecutive_failures ?? 0) + 1;

  const save = db.transaction(() => {
    db.prepare(
      `
        INSERT INTO gitlab_pipeline_checks (
          target_name, timestamp, status, response_time_ms, pipeline_id,
          pipeline_iid, pipeline_status, ref, commit_sha, source,
          pipeline_url, error_message, failed_jobs
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      targetName,
      now,
      result.status,
      result.response_time_ms,
      result.pipeline?.id ?? null,
      result.pipeline?.iid ?? null,
      result.pipeline?.status ?? null,
      result.pipeline?.ref ?? null,
      result.pipeline?.commit_sha ?? null,
      result.pipeline?.source ?? null,
      result.pipeline?.url ?? null,
      result.error_message,
      JSON.stringify(result.failed_jobs)
    );

    db.prepare(
      `
        UPDATE gitlab_pipeline_targets
        SET last_checked = ?,
            last_status = ?,
            last_response_time_ms = ?,
            last_pipeline_id = ?,
            last_pipeline_status = ?,
            last_pipeline_url = ?,
            consecutive_failures = ?
        WHERE name = ?
      `
    ).run(
      now,
      result.status,
      result.response_time_ms,
      result.pipeline?.id ?? null,
      result.pipeline?.status ?? null,
      result.pipeline?.url ?? null,
      consecutiveFailures,
      targetName
    );
  });

  save();
  pruneGitLabPipelineChecks(now);
}

export function getLatestGitLabPipelineCheck(targetName: string): StoredCheck | null {
  const row = getDb()
    .prepare(
      `
        SELECT *
        FROM gitlab_pipeline_checks
        WHERE target_name = ?
        ORDER BY timestamp DESC, id DESC
        LIMIT 1
      `
    )
    .get(targetName) as GitLabPipelineCheckRecord | undefined;

  return row ? { ...row, failed_jobs: parseFailedJobs(row.failed_jobs) } : null;
}

export function pruneGitLabPipelineChecks(now = Date.now()): number {
  const cutoff = now - getRetentionDays() * 24 * 60 * 60 * 1000;

  return getDb()
    .prepare(
      `
        DELETE FROM gitlab_pipeline_checks
        WHERE id IN (
          SELECT id
          FROM gitlab_pipeline_checks
          WHERE timestamp < ?
          ORDER BY timestamp ASC, id ASC
          LIMIT 1000
        )
      `
    )
    .run(cutoff).changes;
}

export function getGitLabPipelineDashboardReport(
  hours: number,
  now = Date.now()
): GitLabPipelineDashboardEntry[] {
  const db = getDb();
  const since = now - hours * 60 * 60 * 1000;
  const targets = db
    .prepare('SELECT * FROM gitlab_pipeline_targets ORDER BY name ASC')
    .all() as TargetRow[];
  const checks = db
    .prepare(
      `
        SELECT target_name, status, response_time_ms
        FROM gitlab_pipeline_checks
        WHERE timestamp > ?
        ORDER BY target_name ASC, timestamp DESC, id DESC
      `
    )
    .all(since) as Array<{
    target_name: string;
    status: GitLabPipelineCheckResult['status'];
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
      base_url: target.base_url,
      project: target.project,
      ref: target.ref,
      current_status: target.last_status,
      latest_pipeline_status: target.last_pipeline_status,
      latest_pipeline_url: target.last_pipeline_url,
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
