import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { evaluateAlertState, setAlertConfig } from './alerts.js';
import { checkServer } from './checker.js';
import { getMaxConcurrency } from './config.js';
import { mapWithConcurrency } from './concurrency.js';
import { getDb, getResolvedDbPath } from './db.js';
import { checkGitHubActionsTarget } from './github-actions.js';
import {
  getGitHubActionsDashboardReport,
  getGitHubActionsTarget,
  listGitHubActionsTargets,
  recordGitHubActionsCheck,
  type GitHubActionsDashboardEntry
} from './github-actions-registry.js';
import { registerGitHubActionsTools } from './github-actions-tools.js';
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
import { toolError } from './tool-errors.js';
import { MONITOR_NAME, MONITOR_VERSION } from './version.js';
import type {
  AlertEvaluation,
  CheckAllInput,
  CheckResult,
  CheckServerInput,
  GitHubActionsCheckResult,
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

function buildGitHubActionsErrorResult(error: unknown): GitHubActionsCheckResult {
  return {
    status: 'error',
    response_time_ms: null,
    error_message: error instanceof Error ? error.message : 'Unknown GitHub Actions error',
    run: null,
    failed_jobs: []
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

function formatGitHubActionsReportRow(entry: GitHubActionsDashboardEntry): string {
  const repository = `${entry.owner}/${entry.repository}`;
  const runLink = entry.latest_run_url ? `[open](${entry.latest_run_url})` : '--';

  return `| ${escapeMarkdownTableCell(entry.name)} | ${escapeMarkdownTableCell(repository)} | ${escapeMarkdownTableCell(entry.workflow)} | ${escapeMarkdownTableCell(entry.branch ?? '--')} | ${formatCurrentStatus(entry.current_status)} | ${escapeMarkdownTableCell(entry.latest_conclusion ?? '--')} | ${formatMetric(entry.uptime_percent, '%')} | ${formatMetric(entry.avg_response_time_ms, 'ms')} | ${entry.consecutive_failures} | ${runLink} |`;
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
  const githubReport = getGitHubActionsDashboardReport(input.hours);
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

  lines.push(
    '',
    '## GitHub Actions',
    '',
    '| Target | Repository | Workflow | Branch | Status | Conclusion | Uptime | Avg RT | Failures | Run |',
    '| ------ | ---------- | -------- | ------ | ------ | ---------- | ------ | ------ | -------- | --- |'
  );

  for (const entry of githubReport) {
    lines.push(formatGitHubActionsReportRow(entry));
  }

  if (githubReport.length === 0) {
    lines.push('| -- | -- | -- | -- | -- | -- | -- | -- | -- | -- |');
  }

  return lines.join('\n');
}

export function registerMonitoringTools(
  server: ToolRegistrar,
  options: MonitoringToolOptions = {}
): void {
  const policy = createRuntimePolicy(options);
  registerGitHubActionsTools(server);

  server.registerTool(
    'register_server',
    {
      title: 'Register MCP Server',
      description:
        'Register an MCP server. Use http for a Streamable HTTP MCP endpoint, sse only for legacy Server-Sent Events servers, and stdio only for a local executable explicitly allowed by runtime policy.',
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
          return formatResponse(
            toolError(
              'STDIO_DISABLED',
              STDIO_DISABLED_MESSAGE,
              'Set HEALTH_MONITOR_ALLOW_STDIO=1 only for trusted local execution, then retry registration.'
            )
          );
        }

        try {
          validateStdioCommandPolicy(input.command);
        } catch (error) {
          return formatResponse(
            toolError(
              'STDIO_COMMAND_REJECTED',
              error instanceof Error
                ? error.message
                : 'stdio command was rejected by runtime policy',
              'Use one executable without shell syntax and, when configured, add it to HEALTH_MONITOR_STDIO_ALLOWLIST.'
            )
          );
        }
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
        return formatResponse(
          toolError(
            'SERVER_NOT_FOUND',
            `Server is not registered: ${input.name}`,
            'Run register_server first, then retry the operation.'
          )
        );
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
      title: 'Check All Targets',
      description:
        'Check all registered MCP servers and GitHub Actions workflows with one bounded concurrency limit. Results preserve MCP-then-GitHub registration order; optional tags filter both target kinds.',
      inputSchema: CheckAllSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true
      }
    },
    async (input: CheckAllInput) => {
      const servers = listServers({ tags: input.tags });
      const githubTargets = listGitHubActionsTargets({ tags: input.tags });
      const targets = [
        ...servers.map((server) => ({ kind: 'mcp_server' as const, name: server.name })),
        ...githubTargets.map((target) => ({ kind: 'github_actions' as const, name: target.name }))
      ];

      if (targets.length === 0) {
        return formatResponse(
          toolError(
            'NO_SERVERS_REGISTERED',
            input.tags?.length
              ? 'No registered monitoring targets match the requested tags.'
              : 'No MCP servers or GitHub Actions workflows are registered.',
            'Run register_server or register_github_actions first, or adjust the tag filter, then retry check_all.'
          )
        );
      }

      const maxConcurrency = getMaxConcurrency();
      const results = await mapWithConcurrency(targets, maxConcurrency, async (target) => {
        if (target.kind === 'mcp_server') {
          const serverConfig = getServer(target.name);
          if (!serverConfig) {
            return {
              kind: target.kind,
              name: target.name,
              ...buildErrorResult(new Error(`Server not found: ${target.name}`)),
              alerts: { has_alerts: false, findings: [] }
            };
          }

          try {
            const result = await checkServerWithPolicy(serverConfig, input.timeout_ms, policy);
            recordHealthCheck(target.name, result);
            return {
              kind: target.kind,
              name: target.name,
              ...result,
              alerts: enrichWithAlerts(target.name, result)
            };
          } catch (error) {
            const result = buildErrorResult(error);
            recordHealthCheck(target.name, result);
            return {
              kind: target.kind,
              name: target.name,
              ...result,
              alerts: enrichWithAlerts(target.name, result)
            };
          }
        }

        const githubConfig = getGitHubActionsTarget(target.name);
        if (!githubConfig) {
          return {
            kind: target.kind,
            name: target.name,
            ...buildGitHubActionsErrorResult(
              new Error(`GitHub Actions target not found: ${target.name}`)
            )
          };
        }

        try {
          const result = await checkGitHubActionsTarget(githubConfig, input.timeout_ms);
          recordGitHubActionsCheck(target.name, result);
          return { kind: target.kind, name: target.name, ...result };
        } catch (error) {
          const result = buildGitHubActionsErrorResult(error);
          recordGitHubActionsCheck(target.name, result);
          return { kind: target.kind, name: target.name, ...result };
        }
      });

      const checks = results.map((result, index) => {
        if (result.status === 'fulfilled') return result.value;
        const target = targets[index];
        if (target?.kind === 'github_actions') {
          return {
            kind: target.kind,
            name: target.name,
            ...buildGitHubActionsErrorResult(result.reason)
          };
        }

        return {
          kind: 'mcp_server' as const,
          name: target?.name ?? 'unknown',
          ...buildErrorResult(result.reason),
          alerts: { has_alerts: false, findings: [] }
        };
      });
      const upCount = checks.filter((result) => result.status === 'up').length;
      const noun = githubTargets.length > 0 ? 'targets' : 'servers';

      return formatResponse({
        summary: `${upCount}/${checks.length} ${noun} UP, ${checks.length - upCount} DOWN`,
        checked_at: new Date().toISOString(),
        max_concurrency: maxConcurrency,
        queued: Math.max(0, targets.length - maxConcurrency),
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
        'Get a dashboard overview of registered MCP servers and GitHub Actions workflows with uptime and performance stats.',
      inputSchema: GetDashboardSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async (input: GetDashboardInput) => {
      const report = getDashboardReport(input.hours);
      const githubReport = getGitHubActionsDashboardReport(input.hours);
      const uptimeValues = report
        .map((entry) => entry.uptime_percent)
        .filter((value): value is number => value !== null);
      const upCount = report.filter((entry) => entry.current_status === 'up').length;
      const githubUpCount = githubReport.filter((entry) => entry.current_status === 'up').length;

      return formatResponse({
        period_hours: input.hours,
        summary: {
          total_servers: report.length,
          currently_up: upCount,
          currently_down: report.length - upCount,
          total_targets: report.length + githubReport.length,
          github_actions_targets: githubReport.length,
          github_actions_up: githubUpCount,
          github_actions_down: githubReport.length - githubUpCount,
          avg_uptime_percent:
            uptimeValues.length > 0
              ? Math.round(
                  uptimeValues.reduce((sum, value) => sum + value, 0) / uptimeValues.length
                )
              : null
        },
        include_tool_stats: input.include_tool_stats,
        github_actions: githubReport,
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
        'Get a human-readable Markdown health report for MCP servers and GitHub Actions workflows. Paste directly into chat or docs.',
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
      const totalGitHubTargets = (
        db.prepare('SELECT COUNT(*) AS count FROM github_actions_targets').get() as {
          count: number;
        }
      ).count;
      const totalGitHubChecks = (
        db.prepare('SELECT COUNT(*) AS count FROM github_actions_checks').get() as { count: number }
      ).count;
      const oldestCheck = (
        db
          .prepare(
            `
            SELECT MIN(timestamp) AS timestamp
            FROM (
              SELECT timestamp FROM health_checks
              UNION ALL
              SELECT timestamp FROM github_actions_checks
            )
          `
          )
          .get() as { timestamp: number | null }
      ).timestamp;

      return formatResponse({
        total_servers_registered: totalServers,
        total_checks_performed: totalChecks,
        total_github_actions_targets: totalGitHubTargets,
        total_github_actions_checks: totalGitHubChecks,
        total_targets_registered: totalServers + totalGitHubTargets,
        total_checks_all_providers: totalChecks + totalGitHubChecks,
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
        return formatResponse(
          toolError(
            'SERVER_NOT_FOUND',
            `Server is not registered: ${input.name}`,
            'Run register_server first, then retry set_alert.'
          )
        );
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
