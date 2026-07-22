import { getRetentionDays } from './config.js';
import { getDb } from './db.js';
import type {
  HttpAssertionDiagnostic,
  HttpCheckRecord,
  HttpCheckResult,
  HttpHeaderAssertion,
  HttpJsonAssertion,
  ListHttpTargetsInput,
  RegisterHttpTargetInput,
  RegisteredHttpTarget
} from './types.js';

type TargetRow = Omit<
  RegisteredHttpTarget,
  'expected_statuses' | 'header_assertions' | 'body_contains' | 'json_assertions' | 'tags'
> & {
  expected_statuses: string;
  header_assertions: string;
  body_contains: string;
  json_assertions: string;
  tags: string;
};

type StoredCheck = Omit<HttpCheckRecord, 'assertions'> & {
  assertions: HttpAssertionDiagnostic[];
};

export interface HttpTargetDashboardEntry {
  name: string;
  url: string;
  current_status: RegisteredHttpTarget['last_status'];
  latest_status_code: number | null;
  latest_final_url: string | null;
  latest_tls_days_remaining: number | null;
  uptime_percent: number | null;
  avg_response_time_ms: number | null;
  total_checks: number;
  failed_assertions: number;
  consecutive_failures: number;
}

function parseArray<T>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function mapTarget(row: TargetRow | undefined): RegisteredHttpTarget | null {
  if (!row) return null;

  return {
    ...row,
    expected_statuses: parseArray<number>(row.expected_statuses),
    header_assertions: parseArray<HttpHeaderAssertion>(row.header_assertions),
    body_contains: parseArray<string>(row.body_contains),
    json_assertions: parseArray<HttpJsonAssertion>(row.json_assertions),
    tags: parseArray<string>(row.tags)
  };
}

function listableStatus(status: RegisteredHttpTarget['last_status']): 'up' | 'down' | 'unknown' {
  if (status === 'up' || status === 'unknown') return status;
  return 'down';
}

export function registerHttpTarget(input: RegisterHttpTargetInput): {
  registered: true;
  name: string;
} {
  const now = Date.now();
  getDb()
    .prepare(
      `
        INSERT INTO http_targets (
          name, url, expected_statuses, header_assertions, body_contains,
          json_assertions, tls_expiry_days, tags, check_interval_minutes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET
          url = excluded.url,
          expected_statuses = excluded.expected_statuses,
          header_assertions = excluded.header_assertions,
          body_contains = excluded.body_contains,
          json_assertions = excluded.json_assertions,
          tls_expiry_days = excluded.tls_expiry_days,
          tags = excluded.tags,
          check_interval_minutes = excluded.check_interval_minutes
      `
    )
    .run(
      input.name,
      input.url,
      JSON.stringify(input.expected_statuses),
      JSON.stringify(input.header_assertions),
      JSON.stringify(input.body_contains),
      JSON.stringify(input.json_assertions),
      input.tls_expiry_days ?? null,
      JSON.stringify(input.tags),
      input.check_interval_minutes,
      now
    );

  return { registered: true, name: input.name };
}

export function unregisterHttpTarget(name: string): { unregistered: true; name: string } {
  getDb().prepare('DELETE FROM http_targets WHERE name = ?').run(name);
  return { unregistered: true, name };
}

export function getHttpTarget(name: string): RegisteredHttpTarget | null {
  const row = getDb().prepare('SELECT * FROM http_targets WHERE name = ?').get(name) as
    | TargetRow
    | undefined;
  return mapTarget(row);
}

export function listHttpTargets(options: ListHttpTargetsInput = {}): RegisteredHttpTarget[] {
  const rows = getDb().prepare('SELECT * FROM http_targets ORDER BY name ASC').all() as TargetRow[];

  return rows
    .map((row) => mapTarget(row))
    .filter((row): row is RegisteredHttpTarget => row !== null)
    .filter((target) => {
      if (options.tags?.length && !options.tags.some((tag) => target.tags.includes(tag))) {
        return false;
      }
      return !options.status || listableStatus(target.last_status) === options.status;
    });
}

export function recordHttpCheck(
  targetName: string,
  result: HttpCheckResult,
  now = Date.now()
): void {
  const db = getDb();
  const target = getHttpTarget(targetName);
  const consecutiveFailures = result.status === 'up' ? 0 : (target?.consecutive_failures ?? 0) + 1;
  const failedAssertionCount = result.assertions.filter((assertion) => !assertion.passed).length;
  const response = result.response;
  const tls = response?.tls ?? null;

  const save = db.transaction(() => {
    db.prepare(
      `
        INSERT INTO http_checks (
          target_name, timestamp, status, response_time_ms, status_code,
          final_url, redirect_count, content_type, content_length,
          tls_subject_cn, tls_issuer_cn, tls_valid_from, tls_valid_to,
          tls_days_remaining, error_message, assertions
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      targetName,
      now,
      result.status,
      result.response_time_ms,
      response?.status_code ?? null,
      response?.final_url ?? null,
      response?.redirect_count ?? null,
      response?.content_type ?? null,
      response?.content_length ?? null,
      tls?.subject_cn ?? null,
      tls?.issuer_cn ?? null,
      tls?.valid_from ?? null,
      tls?.valid_to ?? null,
      tls?.days_remaining ?? null,
      result.error_message,
      JSON.stringify(result.assertions)
    );

    db.prepare(
      `
        UPDATE http_targets
        SET last_checked = ?,
            last_status = ?,
            last_response_time_ms = ?,
            last_status_code = ?,
            last_final_url = ?,
            last_tls_days_remaining = ?,
            last_failed_assertion_count = ?,
            consecutive_failures = ?
        WHERE name = ?
      `
    ).run(
      now,
      result.status,
      result.response_time_ms,
      response?.status_code ?? null,
      response?.final_url ?? null,
      tls?.days_remaining ?? null,
      failedAssertionCount,
      consecutiveFailures,
      targetName
    );
  });

  save();
  pruneHttpChecks(now);
}

export function getLatestHttpCheck(targetName: string): StoredCheck | null {
  const row = getDb()
    .prepare(
      `
        SELECT *
        FROM http_checks
        WHERE target_name = ?
        ORDER BY timestamp DESC, id DESC
        LIMIT 1
      `
    )
    .get(targetName) as HttpCheckRecord | undefined;

  return row ? { ...row, assertions: parseArray<HttpAssertionDiagnostic>(row.assertions) } : null;
}

export function pruneHttpChecks(now = Date.now()): number {
  const cutoff = now - getRetentionDays() * 24 * 60 * 60 * 1000;
  return getDb()
    .prepare(
      `
        DELETE FROM http_checks
        WHERE id IN (
          SELECT id
          FROM http_checks
          WHERE timestamp < ?
          ORDER BY timestamp ASC, id ASC
          LIMIT 1000
        )
      `
    )
    .run(cutoff).changes;
}

export function getHttpDashboardReport(
  hours: number,
  now = Date.now()
): HttpTargetDashboardEntry[] {
  const db = getDb();
  const since = now - hours * 60 * 60 * 1000;
  const targets = db.prepare('SELECT * FROM http_targets ORDER BY name ASC').all() as TargetRow[];
  const checks = db
    .prepare(
      `
        SELECT target_name, status, response_time_ms
        FROM http_checks
        WHERE timestamp > ?
        ORDER BY target_name ASC, timestamp DESC, id DESC
      `
    )
    .all(since) as Array<{
    target_name: string;
    status: HttpCheckResult['status'];
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
      url: target.url,
      current_status: target.last_status,
      latest_status_code: target.last_status_code,
      latest_final_url: target.last_final_url,
      latest_tls_days_remaining: target.last_tls_days_remaining,
      uptime_percent:
        targetChecks.length > 0 ? Math.round((upCount / targetChecks.length) * 100) : null,
      avg_response_time_ms:
        responseTimes.length > 0
          ? Math.round(responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length)
          : null,
      total_checks: targetChecks.length,
      failed_assertions: target.last_failed_assertion_count,
      consecutive_failures: target.consecutive_failures
    };
  });
}
