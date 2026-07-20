process.env.HEALTH_MONITOR_DB = ':memory:';

import { createMonitorServer, registerMonitoringTools } from '../../src/app.js';
import {
  resetAzureDevopsFetchForTests,
  setAzureDevopsFetchForTests
} from '../../src/azure-devops.js';
import { resetCheckerRuntimeForTests, setCheckerRuntimeForTests } from '../../src/checker.js';
import { getDb, resetDbForTests } from '../../src/db.js';
import { registerServer as registerServerRecord } from '../../src/registry.js';
import type { SetAlertInput } from '../../src/types.js';

type ToolResponse = {
  content: Array<{ text: string }>;
};

type ToolHandler = (input: unknown) => Promise<ToolResponse>;

type RegisteredTool = {
  config: Record<string, unknown>;
  handler: ToolHandler;
};

function createToolMap(
  options: Parameters<typeof registerMonitoringTools>[1] = {}
): Map<string, RegisteredTool> {
  const tools = new Map<string, RegisteredTool>();

  registerMonitoringTools(
    {
      registerTool(name: string, config: Record<string, unknown>, handler: unknown) {
        tools.set(name, {
          config,
          handler: handler as ToolHandler
        });
        return {} as never;
      }
    },
    options
  );

  return tools;
}

function getTool(tools: Map<string, RegisteredTool>, name: string): RegisteredTool {
  const tool = tools.get(name);

  if (!tool) {
    throw new Error(`Expected tool to be registered: ${name}`);
  }

  return tool;
}

function parseJson(response: ToolResponse): Record<string, unknown> {
  return JSON.parse(response.content[0]?.text ?? '{}') as Record<string, unknown>;
}

function createAzureResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => payload,
    text: async () => (typeof payload === 'string' ? payload : JSON.stringify(payload))
  } as Response;
}

describe('app tool registration', () => {
  beforeEach(() => {
    process.env.HEALTH_MONITOR_ENCRYPTION_KEY =
      'test-key-material-that-is-at-least-32-characters-long';
    delete process.env.HEALTH_MONITOR_ALLOW_STDIO;
    delete process.env.HEALTH_MONITOR_STDIO_ALLOWLIST;
    resetDbForTests();
    resetAzureDevopsFetchForTests();
    resetCheckerRuntimeForTests();
  });

  afterAll(() => {
    resetDbForTests();
    resetAzureDevopsFetchForTests();
    resetCheckerRuntimeForTests();
    delete process.env.HEALTH_MONITOR_DB;
    delete process.env.HEALTH_MONITOR_ENCRYPTION_KEY;
    delete process.env.HEALTH_MONITOR_ALLOW_STDIO;
    delete process.env.HEALTH_MONITOR_STDIO_ALLOWLIST;
  });

  it('registers all monitoring tools including Azure pipeline tooling', async () => {
    const tools = createToolMap();
    const names = [...tools.keys()];

    expect(names).toEqual(
      expect.arrayContaining([
        'register_azure_pipelines',
        'register_server',
        'check_pipeline_status',
        'check_server',
        'check_all',
        'get_pipeline_logs',
        'check_all_projects',
        'get_uptime',
        'get_dashboard',
        'get_report',
        'list_servers',
        'unregister_server',
        'get_monitor_stats',
        'set_alert'
      ])
    );

    const setAlert = getTool(tools, 'set_alert');

    expect(setAlert.config.annotations).toEqual(
      expect.objectContaining({
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false
      })
    );

    const registerServer = getTool(tools, 'register_server');
    await registerServer.handler({
      name: 'server-a',
      type: 'http',
      url: 'https://example.com/mcp',
      tags: [],
      alert_on_down: true,
      check_interval_minutes: 5,
      args: []
    });

    const response = await setAlert.handler({
      name: 'server-a',
      max_response_time_ms: 250,
      consecutive_failures_before_alert: 2
    } satisfies SetAlertInput);

    expect(response.content[0]?.text).toContain('"configured": true');
  });

  it('handles server lifecycle tools, dashboard summaries, and markdown reporting', async () => {
    const tools = createToolMap();
    const registerServer = getTool(tools, 'register_server');
    const checkServer = getTool(tools, 'check_server');
    const checkAll = getTool(tools, 'check_all');
    const getUptime = getTool(tools, 'get_uptime');
    const getDashboard = getTool(tools, 'get_dashboard');
    const getReport = getTool(tools, 'get_report');
    const listServers = getTool(tools, 'list_servers');
    const unregisterServer = getTool(tools, 'unregister_server');
    const getMonitorStats = getTool(tools, 'get_monitor_stats');
    const setAlert = getTool(tools, 'set_alert');
    const checkPipelineStatus = getTool(tools, 'check_pipeline_status');

    const emptyReport = await getReport.handler({ hours: 24 });
    const emptyDashboard = parseJson(
      await getDashboard.handler({ hours: 24, include_tool_stats: true })
    );
    const emptyMonitorStats = parseJson(await getMonitorStats.handler({}));
    const emptyPipelineStatus = parseJson(await checkPipelineStatus.handler({}));

    expect(emptyReport.content[0]?.text).toContain('| -- | -- | -- | -- | -- | -- | -- |');
    expect(emptyDashboard).toEqual(
      expect.objectContaining({
        period_hours: 24,
        summary: expect.objectContaining({
          total_servers: 0,
          currently_up: 0,
          currently_down: 0,
          avg_uptime_percent: null
        })
      })
    );
    expect(emptyMonitorStats).toEqual(
      expect.objectContaining({
        total_servers_registered: 0,
        total_checks_performed: 0,
        monitoring_since: null
      })
    );
    expect(emptyPipelineStatus).toEqual(
      expect.objectContaining({
        message: 'No Azure pipelines registered. Use register_azure_pipelines first.'
      })
    );

    setCheckerRuntimeForTests({
      createClient: () => ({
        connect: async (transport: unknown) => {
          const url = (transport as { url?: URL }).url?.toString();

          if (url?.includes('beta.example')) {
            throw new Error('connect refused');
          }
        },
        listTools: async () => ({ tools: [{ name: 'health' }, { name: 'status' }] }),
        close: async () => undefined
      }),
      createStreamableTransport: (url: URL) => ({ kind: 'streamable', url }) as never,
      createSseTransport: (url: URL) => ({ kind: 'sse', url }) as never,
      fetchImpl: (async () =>
        ({
          ok: true,
          status: 200,
          statusText: 'OK'
        }) as Response) as unknown as typeof fetch
    });

    await registerServer.handler({
      name: 'alpha',
      type: 'http',
      url: 'https://alpha.example/mcp',
      tags: ['ops'],
      alert_on_down: true,
      check_interval_minutes: 5,
      args: []
    });
    await registerServer.handler({
      name: 'beta',
      type: 'http',
      url: 'https://beta.example/mcp',
      tags: ['ops'],
      alert_on_down: true,
      check_interval_minutes: 5,
      args: []
    });
    await registerServer.handler({
      name: 'gamma',
      type: 'http',
      url: 'https://gamma.example/mcp',
      tags: ['ops'],
      alert_on_down: true,
      check_interval_minutes: 5,
      args: []
    });
    const db = getDb();
    const now = Date.now();

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
    ).run('gamma', now, 'unknown', null, null, 'unknown state', null);
    db.prepare(
      `
        UPDATE servers
        SET last_checked = ?, last_status = ?, last_response_time_ms = ?, consecutive_failures = ?
        WHERE name = ?
      `
    ).run(now, 'unknown', null, 1, 'gamma');

    const preCheckDashboard = parseJson(
      await getDashboard.handler({ hours: 24, include_tool_stats: true })
    );
    const unknownReport = await getReport.handler({ hours: 24 });
    const checkServerResult = parseJson(
      await checkServer.handler({ name: 'alpha', timeout_ms: 5_000 })
    );
    const checkAllResult = parseJson(await checkAll.handler({ tags: ['ops'], timeout_ms: 5_000 }));
    const listUpOnly = parseJson(await listServers.handler({ status: 'up' }));
    const uptime = parseJson(await getUptime.handler({ name: 'alpha', hours: 24 }));
    const dashboard = parseJson(
      await getDashboard.handler({ hours: 24, include_tool_stats: false })
    );
    const report = await getReport.handler({ hours: 24 });
    const monitorStats = parseJson(await getMonitorStats.handler({}));
    const removal = parseJson(await unregisterServer.handler({ name: 'alpha' }));

    expect(preCheckDashboard).toEqual(
      expect.objectContaining({
        servers: expect.arrayContaining([
          expect.objectContaining({
            name: 'alpha',
            alerts: { has_alerts: false, findings: [] }
          }),
          expect.objectContaining({
            name: 'beta',
            alerts: { has_alerts: false, findings: [] }
          }),
          expect.objectContaining({
            name: 'gamma',
            current_status: 'unknown'
          })
        ])
      })
    );
    expect(checkServerResult).toEqual(
      expect.objectContaining({
        name: 'alpha',
        status: 'up',
        tool_count: 2
      })
    );
    expect(checkAllResult).toEqual(
      expect.objectContaining({
        summary: '2/3 servers UP, 1 DOWN'
      })
    );
    expect(listUpOnly).toEqual(
      expect.objectContaining({
        count: 2,
        servers: expect.arrayContaining([
          expect.objectContaining({ name: 'alpha', status: 'up' }),
          expect.objectContaining({ name: 'gamma', status: 'up' })
        ])
      })
    );
    expect(uptime).toEqual(
      expect.objectContaining({
        name: 'alpha',
        total_checks: 2,
        p50_response_time_ms: expect.any(Number),
        p95_response_time_ms: expect.any(Number)
      })
    );
    expect(dashboard).toEqual(
      expect.objectContaining({
        include_tool_stats: false,
        servers: expect.arrayContaining([
          expect.objectContaining({
            name: 'alpha',
            current_status: 'up'
          }),
          expect.objectContaining({
            name: 'beta',
            current_status: 'down'
          })
        ])
      })
    );
    expect((dashboard.servers as Array<Record<string, unknown>>)[0]).not.toHaveProperty(
      'tool_count'
    );
    expect(unknownReport.content[0]?.text).toContain('UNKNOWN');
    expect(report.content[0]?.text).toContain('# MCP Health Report');
    expect(report.content[0]?.text).toContain('alpha');
    expect(report.content[0]?.text).toContain('UP');
    expect(report.content[0]?.text).toContain('DOWN');
    expect(monitorStats).toEqual(
      expect.objectContaining({
        total_servers_registered: 3,
        total_checks_performed: 5,
        monitoring_since: expect.any(String),
        db_path: expect.any(String)
      })
    );
    expect(removal).toEqual(expect.objectContaining({ unregistered: true, name: 'alpha' }));

    await expect(setAlert.handler({ name: 'alpha', max_response_time_ms: 100 })).rejects.toThrow(
      'Server not registered: alpha'
    );
    await expect(checkServer.handler({ name: 'missing', timeout_ms: 1000 })).rejects.toThrow(
      'Server not registered: missing'
    );
  });

  it('rejects stdio registration and execution when stdio policy is disabled', async () => {
    const tools = createToolMap({ allowStdio: false });
    const registerServer = getTool(tools, 'register_server');
    const checkServer = getTool(tools, 'check_server');

    await expect(
      registerServer.handler({
        name: 'local-process',
        type: 'stdio',
        command: 'node',
        args: ['server.js'],
        tags: ['local'],
        alert_on_down: true,
        check_interval_minutes: 5
      })
    ).rejects.toThrow('stdio transport is disabled');

    registerServerRecord({
      name: 'existing-local-process',
      type: 'stdio',
      command: 'node',
      args: ['server.js'],
      tags: ['local'],
      alert_on_down: true,
      check_interval_minutes: 5
    });

    const result = parseJson(
      await checkServer.handler({ name: 'existing-local-process', timeout_ms: 5_000 })
    );

    expect(result).toEqual(
      expect.objectContaining({
        name: 'existing-local-process',
        status: 'error',
        error_message: expect.stringContaining('stdio transport is disabled')
      })
    );
  });

  it('requires explicit stdio opt-in by default', async () => {
    const tools = createToolMap();
    const registerServer = getTool(tools, 'register_server');

    await expect(
      registerServer.handler({
        name: 'default-local-process',
        type: 'stdio',
        command: 'node',
        args: ['server.js'],
        tags: ['local'],
        alert_on_down: true,
        check_interval_minutes: 5
      })
    ).rejects.toThrow('stdio transport is disabled');
  });

  it('enforces stdio command allowlists during registration', async () => {
    process.env.HEALTH_MONITOR_STDIO_ALLOWLIST = 'node';
    const tools = createToolMap({ allowStdio: true });
    const registerServer = getTool(tools, 'register_server');

    await expect(
      registerServer.handler({
        name: 'blocked-local-process',
        type: 'stdio',
        command: 'python',
        args: ['server.py'],
        tags: ['local'],
        alert_on_down: true,
        check_interval_minutes: 5
      })
    ).rejects.toThrow('stdio command is not allowed');

    const response = parseJson(
      await registerServer.handler({
        name: 'allowed-local-process',
        type: 'stdio',
        command: 'node',
        args: ['server.js'],
        tags: ['local'],
        alert_on_down: true,
        check_interval_minutes: 5
      })
    );

    expect(response).toEqual(
      expect.objectContaining({ registered: true, name: 'allowed-local-process' })
    );
  });

  it('registers Azure pipelines, returns statuses, fetches logs, and checks all projects', async () => {
    const tools = createToolMap();
    const registerAzure = getTool(tools, 'register_azure_pipelines');
    const checkPipelineStatus = getTool(tools, 'check_pipeline_status');
    const getPipelineLogs = getTool(tools, 'get_pipeline_logs');
    const checkAllProjects = getTool(tools, 'check_all_projects');
    const registerServer = getTool(tools, 'register_server');

    setCheckerRuntimeForTests({
      createClient: () => ({
        connect: async () => undefined,
        listTools: async () => ({ tools: [{ name: 'health' }] }),
        close: async () => undefined
      }),
      createStreamableTransport: (url: URL) => ({ kind: 'streamable', url }) as never,
      createSseTransport: (url: URL) => ({ kind: 'sse', url }) as never,
      fetchImpl: (async () =>
        ({
          ok: true,
          status: 200,
          statusText: 'OK'
        }) as Response) as unknown as typeof fetch
    });

    setAzureDevopsFetchForTests((async (url: string | URL) => {
      const value = String(url);

      if (value.includes('/_apis/pipelines')) {
        return createAzureResponse({
          value: [
            { id: 7, name: 'known' },
            { id: 8, name: 'empty-build' }
          ]
        });
      }

      if (value.includes('/_apis/build/builds?definitions=7')) {
        return createAzureResponse({
          value: [
            {
              id: 91,
              status: 'completed',
              result: 'failed',
              buildNumber: '20260407.1',
              sourceBranch: 'refs/heads/main',
              startTime: '2026-04-07T10:00:00.000Z',
              finishTime: '2026-04-07T10:01:00.000Z',
              requestedFor: { displayName: 'CI Bot' },
              definition: { name: 'known' }
            }
          ]
        });
      }

      if (value.includes('/_apis/build/builds?definitions=8')) {
        return createAzureResponse({ value: [] });
      }

      if (value.includes('/timeline?')) {
        return createAzureResponse({
          records: [
            {
              name: 'Build',
              result: 'failed',
              log: {
                url: 'https://dev.azure.com/oaslananka/open-source/_apis/build/builds/91/logs/7'
              }
            }
          ]
        });
      }

      if (value === 'https://dev.azure.com/oaslananka/open-source/_apis/build/builds/91/logs/7') {
        return createAzureResponse('line-1\nline-2\nline-3');
      }

      throw new Error(`Unexpected URL: ${value}`);
    }) as typeof fetch);

    await registerServer.handler({
      name: 'portfolio-server',
      type: 'http',
      url: 'https://portfolio.example/mcp',
      tags: ['portfolio'],
      alert_on_down: true,
      check_interval_minutes: 5,
      args: []
    });

    await registerAzure.handler({
      name: 'health-monitor-mcp',
      organization: 'oaslananka',
      project: 'open-source',
      pipeline_names: ['known', 'empty-build', 'missing'],
      pat_token: 'secret'
    });

    const pipelineStatus = parseJson(await checkPipelineStatus.handler({}));
    const logs = parseJson(
      await getPipelineLogs.handler({
        group_name: 'health-monitor-mcp',
        pipeline_name: 'known',
        failed_only: true
      })
    );
    const allProjects = parseJson(await checkAllProjects.handler({ timeout_ms: 5_000 }));

    expect(pipelineStatus).toEqual(
      expect.objectContaining({
        summary: '0 succeeded, 1 failed, 0 in progress',
        all: expect.arrayContaining([
          expect.objectContaining({
            pipeline: 'known',
            status: 'failed',
            id: 91
          }),
          expect.objectContaining({
            pipeline: 'empty-build',
            status: 'unknown',
            error: 'No recent builds found'
          }),
          expect.objectContaining({
            pipeline: 'missing',
            status: 'unknown',
            error: 'Pipeline ID not resolved'
          })
        ])
      })
    );
    expect(logs).toEqual(
      expect.objectContaining({
        group: 'health-monitor-mcp',
        pipeline: 'known',
        build_id: 91,
        logs: expect.stringContaining('=== Build (failed) ===')
      })
    );
    expect(allProjects).toEqual(
      expect.objectContaining({
        summary: 'MCP: 1/1 up | Pipelines: 1 failed',
        mcp_servers: [expect.objectContaining({ name: 'portfolio-server', status: 'up' })],
        azure_pipelines: [
          expect.objectContaining({
            group: 'health-monitor-mcp',
            pipelines: expect.arrayContaining([
              expect.objectContaining({ pipeline: 'known', status: 'failed' }),
              expect.objectContaining({ pipeline: 'empty-build', status: 'unknown' }),
              expect.objectContaining({ pipeline: 'missing', status: 'unknown' })
            ])
          })
        ]
      })
    );

    await expect(
      getPipelineLogs.handler({
        group_name: 'unknown-group',
        pipeline_name: 'known',
        failed_only: true
      })
    ).rejects.toThrow('Pipeline not registered: unknown-group/known');
    await expect(
      getPipelineLogs.handler({
        group_name: 'health-monitor-mcp',
        pipeline_name: 'empty-build',
        failed_only: true
      })
    ).rejects.toThrow('No recent builds found');
    await expect(
      getPipelineLogs.handler({
        group_name: 'health-monitor-mcp',
        pipeline_name: 'missing',
        failed_only: true
      })
    ).rejects.toThrow('Pipeline ID not resolved for health-monitor-mcp/missing');
  });

  it('creates an MCP server instance with versioned metadata', async () => {
    const server = createMonitorServer();

    expect(server).toBeTruthy();
    await server.close();
  });
});
