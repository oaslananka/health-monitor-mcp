import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import type Database from 'better-sqlite3';

import { getRetentionDays, isTruthyEnv } from './config.js';
import { getDb } from './db.js';
import type {
  CheckResult,
  DashboardReportEntry,
  HealthRecord,
  ListServersInput,
  PipelineStatus,
  RecordedPipelineRun,
  RegisterAzurePipelineInput,
  RegisterServerInput,
  RegisteredAzurePipeline,
  RegisteredServer,
  ServerStatus
} from './types.js';

type ServerRow = Omit<RegisteredServer, 'args' | 'tags' | 'alert_on_down'> & {
  args: string;
  tags: string;
  alert_on_down: number;
  response_time_updated_at?: number | null;
};

type ListServerRow = ServerRow & {
  latest_tool_count: number | null;
  uptime_24h_percent: number | null;
};

type DashboardServerRow = Pick<RegisteredServer, 'name' | 'last_status' | 'consecutive_failures'>;

type DashboardCheckRow = Pick<
  HealthRecord,
  'server_name' | 'status' | 'response_time_ms' | 'tool_count'
>;

type AzurePipelineRow = RegisteredAzurePipeline;

const ENCRYPTED_PAT_PREFIX = 'aes-256-gcm:v1';

function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : [];
  } catch {
    return [];
  }
}

function mapServerRow(row: ServerRow | undefined): RegisteredServer | null {
  if (!row) {
    return null;
  }

  return {
    ...row,
    args: parseJsonArray(row.args),
    tags: parseJsonArray(row.tags),
    alert_on_down: Boolean(row.alert_on_down)
  };
}

function mapStatus(lastStatus: RegisteredServer['last_status']): ServerStatus['status'] {
  return lastStatus === 'up' ? 'up' : lastStatus === 'unknown' ? 'unknown' : 'down';
}

function buildServerStatus(row: ListServerRow): ServerStatus {
  const status: ServerStatus = {
    name: row.name,
    type: row.type,
    status: mapStatus(row.last_status),
    last_checked: row.last_checked,
    last_response_time_ms: row.last_response_time_ms,
    tool_count: row.latest_tool_count,
    uptime_24h_percent: row.uptime_24h_percent,
    consecutive_failures: row.consecutive_failures ?? 0,
    tags: parseJsonArray(row.tags)
  };

  if (row.url) {
    status.url = row.url;
  }

  if (row.command) {
    status.command = row.command;
  }

  return status;
}

function calculatePercentile(values: number[], percentile: number): number | null {
  if (!values.length) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * percentile)));

  return sorted[index] ?? null;
}

function getPatEncryptionKey(): Buffer {
  const raw = process.env.HEALTH_MONITOR_ENCRYPTION_KEY?.trim();

  if (!raw) {
    throw new Error('HEALTH_MONITOR_ENCRYPTION_KEY is required to store Azure DevOps PAT tokens');
  }

  if (raw.length < 32) {
    throw new Error('HEALTH_MONITOR_ENCRYPTION_KEY must contain at least 32 characters');
  }

  if (/^[a-f0-9]{64}$/i.test(raw)) {
    return Buffer.from(raw, 'hex');
  }

  return createHash('sha256').update(raw, 'utf8').digest();
}

function decodeBase64Pat(encoded: string): string {
  return Buffer.from(encoded, 'base64').toString('utf8');
}

export function encodePatToken(pat: string): string {
  if (isTruthyEnv(process.env.HEALTH_MONITOR_ALLOW_INSECURE_PAT_STORAGE)) {
    return Buffer.from(pat, 'utf8').toString('base64');
  }

  const key = getPatEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(pat, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    ENCRYPTED_PAT_PREFIX,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url')
  ].join(':');
}

export function decodePatToken(encoded: string): string {
  if (!encoded.startsWith(`${ENCRYPTED_PAT_PREFIX}:`)) {
    if (
      isTruthyEnv(process.env.HEALTH_MONITOR_ALLOW_LEGACY_PAT_DECODING) ||
      isTruthyEnv(process.env.HEALTH_MONITOR_ALLOW_INSECURE_PAT_STORAGE)
    ) {
      return decodeBase64Pat(encoded);
    }

    throw new Error(
      'Refusing to decode legacy PAT storage without HEALTH_MONITOR_ALLOW_LEGACY_PAT_DECODING=1'
    );
  }

  const [, , ivRaw, tagRaw, ciphertextRaw] = encoded.split(':');

  if (!ivRaw || !tagRaw || !ciphertextRaw) {
    throw new Error('Unable to decrypt Azure DevOps PAT');
  }

  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      getPatEncryptionKey(),
      Buffer.from(ivRaw, 'base64url')
    );
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextRaw, 'base64url')),
      decipher.final()
    ]).toString('utf8');
  } catch {
    throw new Error('Unable to decrypt Azure DevOps PAT');
  }
}

/**
 * Legacy helper kept for existing imports. New rows are encrypted unless
 * explicit local insecure storage is enabled.
 */
export function encodeLegacyPatTokenForMigration(pat: string): string {
  return Buffer.from(pat, 'utf8').toString('base64');
}

export function registerServer(input: RegisterServerInput): { registered: true; name: string } {
  const db = getDb();
  const now = Date.now();

  db.prepare(
    `
      INSERT INTO servers (
        name,
        type,
        url,
        command,
        args,
        tags,
        alert_on_down,
        check_interval_minutes,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        type = excluded.type,
        url = excluded.url,
        command = excluded.command,
        args = excluded.args,
        tags = excluded.tags,
        alert_on_down = excluded.alert_on_down,
        check_interval_minutes = excluded.check_interval_minutes
    `
  ).run(
    input.name,
    input.type,
    input.url ?? null,
    input.command ?? null,
    JSON.stringify(input.args),
    JSON.stringify(input.tags),
    input.alert_on_down ? 1 : 0,
    input.check_interval_minutes,
    now
  );

  return { registered: true, name: input.name };
}

export function unregisterServer(name: string): { unregistered: true; name: string } {
  getDb().prepare('DELETE FROM servers WHERE name = ?').run(name);
  return { unregistered: true, name };
}

export function getServer(name: string): RegisteredServer | null {
  const row = getDb().prepare('SELECT * FROM servers WHERE name = ?').get(name) as
    | ServerRow
    | undefined;

  return mapServerRow(row);
}

export function listRegisteredServers(): RegisteredServer[] {
  const rows = getDb().prepare('SELECT * FROM servers ORDER BY name ASC').all() as ServerRow[];

  return rows
    .map((row) => mapServerRow(row))
    .filter((row): row is RegisteredServer => row !== null);
}

export function listServers(options: ListServersInput): ServerStatus[] {
  const since24Hours = Date.now() - 24 * 60 * 60 * 1000;
  const rows = getDb()
    .prepare(
      `
        WITH latest_checks AS (
          SELECT
            server_name,
            tool_count,
            ROW_NUMBER() OVER (
              PARTITION BY server_name
              ORDER BY timestamp DESC, id DESC
            ) AS row_number
          FROM health_checks
        ),
        uptime_24h AS (
          SELECT
            server_name,
            CAST(ROUND(100.0 * SUM(CASE WHEN status = 'up' THEN 1 ELSE 0 END) / COUNT(*)) AS INTEGER) AS uptime_24h_percent
          FROM health_checks
          WHERE timestamp > ?
          GROUP BY server_name
        )
        SELECT
          s.*,
          latest_checks.tool_count AS latest_tool_count,
          uptime_24h.uptime_24h_percent
        FROM servers s
        LEFT JOIN latest_checks
          ON latest_checks.server_name = s.name
         AND latest_checks.row_number = 1
        LEFT JOIN uptime_24h
          ON uptime_24h.server_name = s.name
        ORDER BY s.name ASC
      `
    )
    .all(since24Hours) as ListServerRow[];

  return rows
    .filter((row) => {
      if (!options.tags?.length) {
        return true;
      }

      const tags = parseJsonArray(row.tags);
      return options.tags.some((tag: string) => tags.includes(tag));
    })
    .map(buildServerStatus)
    .filter((serverStatus) => {
      if (!options.status) {
        return true;
      }

      return serverStatus.status === options.status;
    });
}

export function recordHealthCheck(serverName: string, result: CheckResult): void {
  const db = getDb();
  const server = getServer(serverName);
  const now = Date.now();
  const consecutiveFailures = result.status === 'up' ? 0 : (server?.consecutive_failures ?? 0) + 1;

  db.prepare(
    `
      INSERT INTO health_checks (
        server_name,
        timestamp,
        status,
        response_time_ms,
        tool_count,
        error_message,
        tools_snapshot
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    serverName,
    now,
    result.status,
    result.response_time_ms,
    result.tool_count,
    result.error_message,
    result.tools ? JSON.stringify(result.tools) : null
  );

  db.prepare(
    `
      UPDATE servers
      SET
        last_checked = ?,
        last_status = ?,
        last_response_time_ms = ?,
        response_time_updated_at = ?,
        consecutive_failures = ?
      WHERE name = ?
    `
  ).run(
    now,
    result.status,
    result.response_time_ms,
    result.response_time_ms !== null ? now : null,
    consecutiveFailures,
    serverName
  );

  pruneHealthChecks(now);
}

export function pruneHealthChecks(now = Date.now()): number {
  const retentionMs = getRetentionDays() * 24 * 60 * 60 * 1000;
  const cutoff = now - retentionMs;

  return getDb()
    .prepare(
      `
        DELETE FROM health_checks
        WHERE id IN (
          SELECT id
          FROM health_checks
          WHERE timestamp < ?
          ORDER BY timestamp ASC, id ASC
          LIMIT 1000
        )
      `
    )
    .run(cutoff).changes;
}

export function getLatestHealthCheck(serverName: string): HealthRecord | null {
  const row = getDb()
    .prepare(
      `
        SELECT id, server_name, timestamp, status, response_time_ms, tool_count, error_message, tools_snapshot
        FROM health_checks
        WHERE server_name = ?
        ORDER BY timestamp DESC, id DESC
        LIMIT 1
      `
    )
    .get(serverName) as HealthRecord | undefined;

  return row ?? null;
}

export function getUptimeHistory(name: string, hours: number): HealthRecord[] {
  const since = Date.now() - hours * 60 * 60 * 1000;
  return getDb()
    .prepare(
      `
        SELECT id, server_name, timestamp, status, response_time_ms, tool_count, error_message, tools_snapshot
        FROM health_checks
        WHERE server_name = ? AND timestamp > ?
        ORDER BY timestamp ASC, id ASC
      `
    )
    .all(name, since) as HealthRecord[];
}

export function getDashboardReport(hours: number): DashboardReportEntry[] {
  const db = getDb();
  const since = Date.now() - hours * 60 * 60 * 1000;
  const servers = db
    .prepare(
      `
        SELECT name, last_status, consecutive_failures
        FROM servers
        ORDER BY name ASC
      `
    )
    .all() as DashboardServerRow[];
  const checks = db
    .prepare(
      `
        SELECT server_name, status, response_time_ms, tool_count
        FROM health_checks
        WHERE timestamp > ?
        ORDER BY server_name ASC, timestamp DESC, id DESC
      `
    )
    .all(since) as DashboardCheckRow[];
  const checksByServer = new Map<string, DashboardCheckRow[]>();

  for (const check of checks) {
    const serverChecks = checksByServer.get(check.server_name) ?? [];
    serverChecks.push(check);
    checksByServer.set(check.server_name, serverChecks);
  }

  return servers.map((server) => {
    const serverChecks = checksByServer.get(server.name) ?? [];
    const responseTimes = serverChecks
      .map((check) => check.response_time_ms)
      .filter((value): value is number => value !== null);
    const upCount = serverChecks.filter((check) => check.status === 'up').length;
    const averageResponseTime =
      responseTimes.length > 0
        ? Math.round(responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length)
        : null;

    return {
      name: server.name,
      current_status: server.last_status ?? 'unknown',
      uptime_percent:
        serverChecks.length > 0 ? Math.round((upCount / serverChecks.length) * 100) : null,
      avg_response_time_ms: averageResponseTime,
      p50_response_time_ms: calculatePercentile(responseTimes, 0.5),
      p95_response_time_ms: calculatePercentile(responseTimes, 0.95),
      total_checks: serverChecks.length,
      consecutive_failures: server.consecutive_failures ?? 0,
      tool_count: serverChecks[0]?.tool_count ?? null
    };
  });
}

export function getUptimePercent(
  db: Database.Database,
  name: string,
  hours: number
): number | null {
  const since = Date.now() - hours * 60 * 60 * 1000;
  const rows = db
    .prepare(
      `
        SELECT status
        FROM health_checks
        WHERE server_name = ? AND timestamp > ?
      `
    )
    .all(name, since) as Array<{ status: string }>;

  if (!rows.length) {
    return null;
  }

  const upCount = rows.filter((row) => row.status === 'up').length;
  return Math.round((upCount / rows.length) * 100);
}

export function registerAzurePipelines(
  input: RegisterAzurePipelineInput,
  resolvedPipelines: Array<{ name: string; id: number | null }>
): { registered: true; group: string; pipelines: string[] } {
  const db = getDb();
  const now = Date.now();
  const encodedPatToken = encodePatToken(input.pat_token);
  const insert = db.prepare(
    `
      INSERT INTO azure_pipelines (
        group_name,
        organization,
        project,
        pipeline_name,
        pipeline_id,
        pat_token_encrypted,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(group_name, pipeline_name) DO UPDATE SET
        organization = excluded.organization,
        project = excluded.project,
        pipeline_id = excluded.pipeline_id,
        pat_token_encrypted = excluded.pat_token_encrypted
    `
  );

  const transaction = db.transaction(() => {
    for (const pipeline of resolvedPipelines) {
      insert.run(
        input.name,
        input.organization,
        input.project,
        pipeline.name,
        pipeline.id,
        encodedPatToken,
        now
      );
    }
  });

  transaction();

  return {
    registered: true,
    group: input.name,
    pipelines: resolvedPipelines.map((pipeline) => pipeline.name)
  };
}

export function listAzurePipelines(groupName?: string): RegisteredAzurePipeline[] {
  const query = groupName
    ? 'SELECT * FROM azure_pipelines WHERE group_name = ? ORDER BY group_name ASC, pipeline_name ASC'
    : 'SELECT * FROM azure_pipelines ORDER BY group_name ASC, pipeline_name ASC';

  return getDb()
    .prepare(query)
    .all(...(groupName ? [groupName] : [])) as AzurePipelineRow[];
}

export function listAzurePipelineGroups(): string[] {
  return (
    getDb()
      .prepare('SELECT DISTINCT group_name FROM azure_pipelines ORDER BY group_name ASC')
      .all() as Array<{ group_name: string }>
  ).map((row) => row.group_name);
}

export function getAzurePipeline(
  groupName: string,
  pipelineName: string
): RegisteredAzurePipeline | null {
  const row = getDb()
    .prepare(
      `
        SELECT *
        FROM azure_pipelines
        WHERE group_name = ? AND pipeline_name = ?
      `
    )
    .get(groupName, pipelineName) as AzurePipelineRow | undefined;

  return row ?? null;
}

export function recordPipelineRun(
  groupName: string,
  pipelineName: string,
  run: PipelineStatus
): RecordedPipelineRun {
  const db = getDb();
  const recordedAt = Date.now();
  db.prepare(
    `
      INSERT INTO pipeline_runs (
        group_name,
        pipeline_name,
        build_id,
        status,
        result,
        build_number,
        start_time,
        finish_time,
        recorded_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(group_name, pipeline_name, build_id) DO UPDATE SET
        status = excluded.status,
        result = excluded.result,
        build_number = excluded.build_number,
        start_time = excluded.start_time,
        finish_time = excluded.finish_time,
        recorded_at = excluded.recorded_at
    `
  ).run(
    groupName,
    pipelineName,
    run.id,
    run.status,
    run.result,
    run.build_number,
    run.start_time,
    run.finish_time,
    recordedAt
  );
  const row = db
    .prepare(
      `
        SELECT *
        FROM pipeline_runs
        WHERE group_name = ? AND pipeline_name = ? AND build_id = ?
      `
    )
    .get(groupName, pipelineName, run.id) as RecordedPipelineRun | undefined;

  if (!row) {
    throw new Error('Failed to record Azure pipeline run');
  }

  return row;
}
