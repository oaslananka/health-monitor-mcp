import { getDb } from './db.js';
import { getServer, getUptimePercent } from './registry.js';
import type {
  AlertConfigRecord,
  AlertEvaluation,
  AlertFinding,
  CheckResult,
  SetAlertInput
} from './types.js';

const DEFAULT_CONSECUTIVE_FAILURE_THRESHOLD = 3;

export function setAlertConfig(input: SetAlertInput): {
  configured: true;
  config: AlertConfigRecord;
} {
  const db = getDb();

  db.prepare(
    `
      INSERT INTO alerts (
        server_name,
        max_response_time_ms,
        min_uptime_percent,
        consecutive_failures_before_alert
      )
      VALUES (?, ?, ?, ?)
      ON CONFLICT(server_name) DO UPDATE SET
        max_response_time_ms = excluded.max_response_time_ms,
        min_uptime_percent = excluded.min_uptime_percent,
        consecutive_failures_before_alert = excluded.consecutive_failures_before_alert
    `
  ).run(
    input.name,
    input.max_response_time_ms ?? null,
    input.min_uptime_percent ?? null,
    input.consecutive_failures_before_alert
  );

  const config = getAlertConfig(input.name);
  if (!config) {
    throw new Error(`Failed to persist alert configuration for ${input.name}`);
  }

  return {
    configured: true,
    config
  };
}

export function getAlertConfig(name: string): AlertConfigRecord | null {
  const row = getDb()
    .prepare(
      `
        SELECT server_name, max_response_time_ms, min_uptime_percent, consecutive_failures_before_alert
        FROM alerts
        WHERE server_name = ?
      `
    )
    .get(name) as AlertConfigRecord | undefined;

  return row ?? null;
}

function getEffectiveAlertConfig(name: string): AlertConfigRecord {
  return (
    getAlertConfig(name) ?? {
      server_name: name,
      max_response_time_ms: null,
      min_uptime_percent: null,
      consecutive_failures_before_alert: DEFAULT_CONSECUTIVE_FAILURE_THRESHOLD
    }
  );
}

export function evaluateAlertState(
  serverName: string,
  result: CheckResult,
  options: { uptimeWindowHours?: number | undefined } = {}
): AlertEvaluation {
  const server = getServer(serverName);
  const config = getEffectiveAlertConfig(serverName);
  const findings: AlertFinding[] = [];

  if (server?.alert_on_down && result.status !== 'up') {
    findings.push({
      type: 'down',
      message: `${serverName} is ${result.status.toUpperCase()}`,
      actual: result.status,
      threshold: 'up'
    });
  }

  if (
    config.max_response_time_ms !== null &&
    result.response_time_ms !== null &&
    result.response_time_ms > config.max_response_time_ms
  ) {
    findings.push({
      type: 'response_time',
      message: `${serverName} response time ${result.response_time_ms}ms exceeds ${config.max_response_time_ms}ms`,
      actual: result.response_time_ms,
      threshold: config.max_response_time_ms
    });
  }

  if (config.min_uptime_percent !== null && server) {
    const uptime = getUptimePercent(getDb(), serverName, options.uptimeWindowHours ?? 24);

    if (uptime !== null && uptime < config.min_uptime_percent) {
      findings.push({
        type: 'uptime',
        message: `${serverName} uptime ${uptime}% is below ${config.min_uptime_percent}%`,
        actual: uptime,
        threshold: config.min_uptime_percent
      });
    }
  }

  if (
    result.status !== 'up' &&
    (server?.consecutive_failures ?? 0) >= config.consecutive_failures_before_alert
  ) {
    findings.push({
      type: 'consecutive_failures',
      message: `${serverName} failed ${server?.consecutive_failures ?? 0} times consecutively`,
      actual: server?.consecutive_failures ?? 0,
      threshold: config.consecutive_failures_before_alert
    });
  }

  return {
    has_alerts: findings.length > 0,
    findings
  };
}
