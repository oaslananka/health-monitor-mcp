import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { evaluateAlertState, setAlertConfig } from './alerts.js';
import { checkServer } from './checker.js';
import { getDb, getResolvedDbPath } from './db.js';
import {
  createRuntimePolicy,
  STDIO_DISABLED_MESSAGE,
  validateStdioCommandPolicy,
  type RuntimePolicy,
  type RuntimePolicyOptions
} from './policy.js';
import {
  getDashboardReport,
  getLatestHealthCheck,
  getServer,
  getUptimeHistory,
  listServers,
  recordHealthCheck,
  registerServer,
  unregisterServer
} from './registry.js';
import {
  CheckAllSchema,
  CheckServerSchema,
  EmptySchema,
  GetDashboardSchema,
  GetReportSchema,
  GetUptimeSchema,
  ListServersSchema,
  RegisterServerSchema,
  SetAlertSchema,
  UnregisterSchema
} from './types.js';
import { MONITOR_NAME, MONITOR_VERSION } from './version.js';
import type {
  AlertEvaluation,
  CheckAllInput,
  CheckResult,
  CheckServerInput,
  GetDashboardInput,
  GetReportInput,
  GetUptimeInput,
  ListServersInput,
  RegisterServerInput,
  RegisteredServer,
  SetAlertInput,
  UnregisterInput
} from './types.js';

type ToolResponse = {
  content: Array<{
    type: 'text';
    text: string;
  }>;
};

/**
 * Metadata and schema passed when registering an MCP tool with the server SDK.
 */
export type ToolConfig = {
  title?: string;
  description?: string;
  inputSchema?: object;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    openWorldHint?: boolean;
  };
};

/**
 * Minimal tool-registration surface used by the monitor server factory.
 */
export type ToolRegistrar = {
  registerTool: (name: string, config: ToolConfig, handler: unknown) => unknown;
};

/**
 * Runtime policy options accepted by the monitor tool registration helpers.
 */
export type MonitoringToolOptions = RuntimePolicyOptions;

function formatResponse(payload: unknown): ToolResponse {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(payload, null, 2)
      }
    ]
  };
}

function formatTextResponse(text: string): ToolResponse {
  return {
    content: [
      {
        type: 'text',
        text
      }
    ]
  };
}

function buildErrorResult(error: unknown): CheckResult {
  return {
    status: 'error',
    response_time_ms: null,
    tool_count: null,
    error_message: error instanceof Error ? error.message : 'Unknown error',
    tools: null
  };
}

function enrichWithAlerts(
  serverName: string,
  result: CheckResult,
  options: { hours?: number } = {}
): AlertEvaluation {
  return options.hours === undefined
    ? evaluateAlertState(serverName, result)
    : evaluateAlertState(serverName, result, { uptimeWindowHours: options.hours });
}

function getLatestDashboardResult(server: Pick<RegisteredServer, 'name'>): CheckResult | null {
  const latest = getLatestHealthCheck(server.name);
  if (!latest) {
    return null;
  }

  return {
    status: latest.status,
    response_time_ms: latest.response_time_ms,
    tool_count: latest.tool_count,
    error_message: latest.error_message,
    tools: latest.tools_snapshot ? (JSON.parse(latest.tools_snapshot) as string[]) : null
  };
}

function formatCurrentStatus(status: string): string {
  if (status === 'up') {
    return 'UP';
  }

  if (status === 'unknown') {
    return 'UNKNOWN';
  }

  return status.toUpperCase();
}

function formatMetric(value: number | null, suffix = ''): string {
  return value === null ? '--' : `${value}${suffix}`;
}

function escapeMarkdownTableCell(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/[\r\n]+/g, ' ');
}

function buildStdioDisabledResult(): CheckResult {
  return {
    status: 'error',
    response_time_ms: null,
    tool_count: null,
    error_message: STDIO_DISABLED_MESSAGE,
    tools: null
  };
}

async function checkServerWithPolicy(
  server: RegisteredServer,
  timeoutMs: number,
  policy: RuntimePolicy
): Promise<CheckResult> {
  if (server.type === 'stdio' && !policy.allowStdio) {
    return buildStdioDisabledResult();
  }

  return checkServer(server, timeoutMs, { allowStdio: policy.allowStdio });
}

function formatMarkdownReport(input: GetReportInput): string {
  const report = getDashboardReport(input.hours);
  const lines = [
    '# MCP Health Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Period: ${input.hours}h`,
    '',
    '| Server | Status | Uptime | Avg RT | P50 RT | P95 RT | Failures |',
    '| ------ | ------ | ------ | ------ | ------ | ------ | -------- |'
  ];

  for (const entry of report) {
    lines.push(
      `| ${escapeMarkdownTableCell(entry.name)} | ${formatCurrentStatus(entry.current_status)} | ${formatMetric(
        entry.uptime_percent,
        '%'
      )} | ${formatMetric(entry.avg_response_time_ms, 'ms')} | ${formatMetric(
        entry.p50_response_time_ms,
        'ms'
      )} | ${formatMetric(entry.p95_response_time_ms, 'ms')} | ${entry.consecutive_failures} |`
    );
  }

  if (report.length === 0) {
    lines.push('| -- | -- | -- | -- | -- | -- | -- |');
  }

  return lines.join('\n');
}

export function registerMonitoringTools(
  server: ToolRegistrar,
  options: MonitoringToolOptions = {}
): void {
  const policy = createRuntimePolicy(options);

  server.registerTool(
    'register_server',
    {
      title: 'Register MCP Server',
      description: 'Register an MCP server to monitor. Supports http, sse, and stdio transports.',
      inputSchema: RegisterServerSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async (input: RegisterServerInput) => {
      if (input.type === 'stdio') {
        if (!policy.allowStdio) {
          throw new Error(STDIO_DISABLED_MESSAGE);
        }

        validateStdioCommandPolicy(input.command);
      }

      const result = registerServer(input);
      return formatResponse({
        ...result,
        message: `${input.name} registered. Run check_server to verify connectivity.`
      });
    }
  );

  server.registerTool(
    'check_server',
    {
      title: 'Check Server Health',
      description:
        'Check the health of a registered MCP server, list tools, and measure response time.',
      inputSchema: CheckServerSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true
      }
    },
    async (input: CheckServerInput) => {
      const registered = getServer(input.name);
      if (!registered) {
        throw new Error(`Server not registered: ${input.name}`);
      }

      const result = await checkServerWithPolicy(registered, input.timeout_ms, policy);
      recordHealthCheck(input.name, result);

      return formatResponse({
        name: input.name,
        ...result,
        alerts: enrichWithAlerts(input.name, result),
        checked_at: new Date().toISOString(),
        message:
          result.status === 'up'
            ? `${input.name} is UP - ${result.tool_count} tools in ${result.response_time_ms}ms`
            : `${input.name} is ${result.status.toUpperCase()} - ${result.error_message}`
      });
    }
  );

  server.registerTool(
    'check_all',
    {
      title: 'Check All Servers',
      description: 'Check health of all registered MCP servers in parallel.',
      inputSchema: CheckAllSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true
      }
    },
    async (input: CheckAllInput) => {
      const servers = listServers({ tags: input.tags });
      const results = await Promise.allSettled(
        servers.map(async (listedServer) => {
          const serverConfig = getServer(listedServer.name);
          if (!serverConfig) {
            return {
              name: listedServer.name,
              ...buildErrorResult(new Error(`Server not found: ${listedServer.name}`)),
              alerts: {
                has_alerts: false,
                findings: []
              }
            };
          }

          try {
            const result = await checkServerWithPolicy(serverConfig, input.timeout_ms, policy);
            recordHealthCheck(listedServer.name, result);
            return {
              name: listedServer.name,
              ...result,
              alerts: enrichWithAlerts(listedServer.name, result)
            };
          } catch (error) {
            const result = buildErrorResult(error);
            recordHealthCheck(listedServer.name, result);
            return {
              name: listedServer.name,
              ...result,
              alerts: enrichWithAlerts(listedServer.name, result)
            };
          }
        })
      );
      const checks = results.map((result, index) =>
        result.status === 'fulfilled'
          ? result.value
          : {
              name: servers[index]?.name ?? 'unknown',
              ...buildErrorResult(result.reason),
              alerts: {
                has_alerts: false,
                findings: []
              }
            }
      );
      const upCount = checks.filter((result) => result.status === 'up').length;

      return formatResponse({
        summary: `${upCount}/${checks.length} servers UP, ${checks.length - upCount} DOWN`,
        checked_at: new Date().toISOString(),
        results: checks
      });
    }
  );

  server.registerTool(
    'get_uptime',
    {
      title: 'Get Uptime Statistics',
      description: 'Get uptime history and statistics for a registered MCP server.',
      inputSchema: GetUptimeSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async (input: GetUptimeInput) => {
      const history = getUptimeHistory(input.name, input.hours);
      const upCount = history.filter((row) => row.status === 'up').length;
      const responseTimes = history
        .map((row) => row.response_time_ms)
        .filter((value): value is number => value !== null)
        .sort((left, right) => left - right);
      const averageResponseTime =
        responseTimes.length > 0
          ? Math.round(responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length)
          : null;
      const p50 =
        responseTimes[Math.min(responseTimes.length - 1, Math.floor(responseTimes.length * 0.5))] ??
        null;
      const p95 =
        responseTimes[
          Math.min(responseTimes.length - 1, Math.floor(responseTimes.length * 0.95))
        ] ?? null;

      return formatResponse({
        name: input.name,
        period_hours: input.hours,
        total_checks: history.length,
        uptime_percent: history.length ? Math.round((upCount / history.length) * 100) : null,
        avg_response_time_ms: averageResponseTime,
        p50_response_time_ms: p50,
        p95_response_time_ms: p95,
        history: history.slice(-50)
      });
    }
  );

  server.registerTool(
    'get_dashboard',
    {
      title: 'Get Health Dashboard',
      description:
        'Get a dashboard overview of all registered MCP servers with uptime and performance stats.',
      inputSchema: GetDashboardSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async (input: GetDashboardInput) => {
      const report = getDashboardReport(input.hours);
      const uptimeValues = report
        .map((entry) => entry.uptime_percent)
        .filter((value): value is number => value !== null);
      const upCount = report.filter((entry) => entry.current_status === 'up').length;

      return formatResponse({
        period_hours: input.hours,
        summary: {
          total_servers: report.length,
          currently_up: upCount,
          currently_down: report.length - upCount,
          avg_uptime_percent:
            uptimeValues.length > 0
              ? Math.round(
                  uptimeValues.reduce((sum, value) => sum + value, 0) / uptimeValues.length
                )
              : null
        },
        include_tool_stats: input.include_tool_stats,
        servers: report.map((serverReport) => {
          const latest = getLatestDashboardResult(serverReport);
          const payload = {
            ...serverReport,
            alerts: latest
              ? enrichWithAlerts(serverReport.name, latest, { hours: input.hours })
              : { has_alerts: false, findings: [] }
          };

          if (input.include_tool_stats) {
            return payload;
          }

          return {
            ...payload,
            tool_count: undefined
          };
        })
      });
    }
  );

  server.registerTool(
    'get_report',
    {
      title: 'Get Health Report (Markdown)',
      description:
        'Get a human-readable Markdown health report for all servers. Paste directly into chat or docs.',
      inputSchema: GetReportSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async (input: GetReportInput) => formatTextResponse(formatMarkdownReport(input))
  );

  server.registerTool(
    'list_servers',
    {
      title: 'List Registered Servers',
      description: 'List all registered MCP servers with their current status.',
      inputSchema: ListServersSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async (input: ListServersInput) => {
      const servers = listServers(input);
      return formatResponse({
        count: servers.length,
        servers
      });
    }
  );

  server.registerTool(
    'unregister_server',
    {
      title: 'Unregister Server',
      description: 'Remove a server from monitoring.',
      inputSchema: UnregisterSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: false
      }
    },
    async (input: UnregisterInput) => formatResponse(unregisterServer(input.name))
  );

  server.registerTool(
    'get_monitor_stats',
    {
      title: 'Get Monitor Statistics',
      description: 'Get statistics about the health monitor itself, including database activity.',
      inputSchema: EmptySchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async () => {
      const db = getDb();
      const totalChecks = (
        db.prepare('SELECT COUNT(*) AS count FROM health_checks').get() as { count: number }
      ).count;
      const totalServers = (
        db.prepare('SELECT COUNT(*) AS count FROM servers').get() as { count: number }
      ).count;
      const oldestCheck = (
        db.prepare('SELECT MIN(timestamp) AS timestamp FROM health_checks').get() as {
          timestamp: number | null;
        }
      ).timestamp;

      return formatResponse({
        total_servers_registered: totalServers,
        total_checks_performed: totalChecks,
        monitoring_since: oldestCheck ? new Date(oldestCheck).toISOString() : null,
        db_path: getResolvedDbPath()
      });
    }
  );

  server.registerTool(
    'set_alert',
    {
      title: 'Set Alert Thresholds',
      description:
        'Configure alert thresholds for response time, uptime, and consecutive failures.',
      inputSchema: SetAlertSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async (input: SetAlertInput) => {
      if (!getServer(input.name)) {
        throw new Error(`Server not registered: ${input.name}`);
      }

      return formatResponse(setAlertConfig(input));
    }
  );
}

export function createMonitorServer(options: MonitoringToolOptions = {}): McpServer {
  const server = new McpServer(
    {
      name: MONITOR_NAME,
      version: MONITOR_VERSION
    },
    {
      capabilities: {
        logging: {}
      }
    }
  );

  registerMonitoringTools(server as unknown as ToolRegistrar, options);
  return server;
}
