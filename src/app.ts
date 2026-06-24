import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { evaluateAlertState, setAlertConfig } from './alerts.js';
import { getLatestRun, getPipelineLogs, listPipelines } from './azure-devops.js';
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
  decodePatToken,
  getAzurePipeline,
  getDashboardReport,
  getLatestHealthCheck,
  getServer,
  getUptimeHistory,
  listAzurePipelineGroups,
  listAzurePipelines,
  listServers,
  recordHealthCheck,
  recordPipelineRun,
  registerAzurePipelines,
  registerServer,
  unregisterServer
} from './registry.js';
import {
  CheckAllProjectsSchema,
  CheckAllSchema,
  CheckPipelineStatusSchema,
  CheckServerSchema,
  EmptySchema,
  GetDashboardSchema,
  GetReportSchema,
  GetUptimeSchema,
  ListServersSchema,
  RegisterAzurePipelineSchema,
  RegisterServerSchema,
  RegisteredPipelineLogsSchema,
  SetAlertSchema,
  UnregisterSchema
} from './types.js';
import { MONITOR_NAME, MONITOR_VERSION } from './version.js';
import type {
  AlertEvaluation,
  CheckAllInput,
  CheckAllProjectsInput,
  CheckPipelineStatusInput,
  CheckResult,
  CheckServerInput,
  GetDashboardInput,
  GetReportInput,
  GetUptimeInput,
  ListServersInput,
  RegisterAzurePipelineInput,
  RegisterServerInput,
  RegisteredPipelineLogsInput,
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
    'register_azure_pipelines',
    {
      title: 'Register Azure DevOps Pipelines',
      description: 'Register Azure DevOps pipelines to monitor for CI, publish, and mirror status.',
      inputSchema: RegisterAzurePipelineSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true
      }
    },
    async (input: RegisterAzurePipelineInput) => {
      const available = await listPipelines(input.organization, input.project, input.pat_token);
      const resolved: Array<{ name: string; id: number | null }> = input.pipeline_names.map(
        (name: string) => ({
          name,
          id: available.find((pipeline) => pipeline.name === name)?.id ?? null
        })
      );

      registerAzurePipelines(input, resolved);

      return formatResponse({
        registered: true,
        group: input.name,
        pipelines: resolved.map((pipeline) => pipeline.name),
        resolved_ids: resolved
      });
    }
  );

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
    'check_pipeline_status',
    {
      title: 'Check Azure Pipeline Status',
      description:
        'Get the latest run status of registered Azure DevOps pipelines for one group or all groups.',
      inputSchema: CheckPipelineStatusSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true
      }
    },
    async (input: CheckPipelineStatusInput) => {
      const rows = listAzurePipelines(input.group_name);

      if (!rows.length) {
        return formatResponse({
          message: 'No Azure pipelines registered. Use register_azure_pipelines first.'
        });
      }

      const results = await Promise.allSettled(
        rows.map(async (row) => {
          if (!row.pipeline_id) {
            return {
              group: row.group_name,
              pipeline: row.pipeline_name,
              status: 'unknown',
              error: 'Pipeline ID not resolved'
            };
          }

          const run = await getLatestRun(
            row.organization,
            row.project,
            row.pipeline_id,
            decodePatToken(row.pat_token_encrypted)
          );

          if (!run) {
            return {
              group: row.group_name,
              pipeline: row.pipeline_name,
              status: 'unknown',
              error: 'No recent builds found'
            };
          }

          recordPipelineRun(row.group_name, row.pipeline_name, run);

          return {
            group: row.group_name,
            pipeline: row.pipeline_name,
            ...run
          };
        })
      );

      const statuses = results.map((result) =>
        result.status === 'fulfilled'
          ? result.value
          : { status: 'unknown', error: String(result.reason) }
      );
      const statusValues = statuses.map((status) =>
        typeof status === 'object' && status !== null && 'status' in status
          ? status.status
          : 'unknown'
      );
      const failed = statuses.filter((_, index) => statusValues[index] === 'failed');
      const inProgress = statuses.filter((_, index) => statusValues[index] === 'inProgress');
      const succeeded = statusValues.filter((status) => status === 'succeeded').length;

      return formatResponse({
        summary: `${succeeded} succeeded, ${failed.length} failed, ${inProgress.length} in progress`,
        failed_pipelines: failed,
        all: statuses
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
    'get_pipeline_logs',
    {
      title: 'Get Pipeline Logs',
      description:
        'Fetch logs from a specific Azure DevOps build to investigate pipeline failures.',
      inputSchema: RegisteredPipelineLogsSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true
      }
    },
    async (input: RegisteredPipelineLogsInput) => {
      const row = getAzurePipeline(input.group_name, input.pipeline_name);

      if (!row) {
        throw new Error(`Pipeline not registered: ${input.group_name}/${input.pipeline_name}`);
      }

      if (!row.pipeline_id) {
        throw new Error(`Pipeline ID not resolved for ${input.group_name}/${input.pipeline_name}`);
      }

      const pat = decodePatToken(row.pat_token_encrypted);
      let buildId = input.build_id;

      if (!buildId) {
        const latest = await getLatestRun(row.organization, row.project, row.pipeline_id, pat);
        buildId = latest?.id;

        if (latest) {
          recordPipelineRun(row.group_name, row.pipeline_name, latest);
        }
      }

      if (!buildId) {
        throw new Error('No recent builds found');
      }

      const logs = await getPipelineLogs(
        row.organization,
        row.project,
        buildId,
        pat,
        input.failed_only
      );

      return formatResponse({
        group: input.group_name,
        pipeline: input.pipeline_name,
        build_id: buildId,
        logs
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
    'check_all_projects',
    {
      title: 'Check All Projects Health',
      description:
        'Check both MCP server health and Azure DevOps pipeline status across all registered projects.',
      inputSchema: CheckAllProjectsSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true
      }
    },
    async (input: CheckAllProjectsInput) => {
      const servers = listServers({});
      const pipelineGroups = listAzurePipelineGroups();

      const [mcpResults, pipelineResults] = await Promise.all([
        Promise.allSettled(
          servers.map(async (listedServer) => {
            const serverConfig = getServer(listedServer.name);
            if (!serverConfig) {
              return {
                name: listedServer.name,
                type: 'mcp_server',
                ...buildErrorResult(new Error(`Server not found: ${listedServer.name}`))
              };
            }

            const result = await checkServerWithPolicy(serverConfig, input.timeout_ms, policy);
            recordHealthCheck(listedServer.name, result);
            return {
              name: listedServer.name,
              type: 'mcp_server',
              ...result
            };
          })
        ),
        Promise.allSettled(
          pipelineGroups.map(async (groupName) => {
            const groupRows = listAzurePipelines(groupName);
            const pipelines = await Promise.all(
              groupRows.map(async (row) => {
                if (!row.pipeline_id) {
                  return {
                    pipeline: row.pipeline_name,
                    status: 'unknown'
                  };
                }

                const run = await getLatestRun(
                  row.organization,
                  row.project,
                  row.pipeline_id,
                  decodePatToken(row.pat_token_encrypted)
                );

                if (!run) {
                  return {
                    pipeline: row.pipeline_name,
                    status: 'unknown'
                  };
                }

                recordPipelineRun(row.group_name, row.pipeline_name, run);
                return {
                  pipeline: row.pipeline_name,
                  ...run
                };
              })
            );

            return {
              group: groupName,
              type: 'azure_pipeline',
              pipelines
            };
          })
        )
      ]);

      const mcp = mcpResults.map((result) =>
        result.status === 'fulfilled' ? result.value : { error: String(result.reason) }
      );
      const pipelines = pipelineResults.map((result) =>
        result.status === 'fulfilled' ? result.value : { error: String(result.reason) }
      );
      const mcpDown = mcp.filter(
        (result) =>
          typeof result === 'object' &&
          result !== null &&
          'status' in result &&
          result.status !== 'up'
      ).length;
      const pipelineFailed = pipelines
        .flatMap((group) =>
          typeof group === 'object' && group !== null && 'pipelines' in group
            ? ((group.pipelines as Array<Record<string, unknown>>) ?? [])
            : []
        )
        .filter((pipeline) => pipeline.status === 'failed').length;

      return formatResponse({
        summary: `MCP: ${mcp.length - mcpDown}/${mcp.length} up | Pipelines: ${pipelineFailed} failed`,
        mcp_servers: mcp,
        azure_pipelines: pipelines
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
