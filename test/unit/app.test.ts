process.env.HEALTH_MONITOR_DB = ':memory:';

import { createMonitorServer, registerMonitoringTools } from '../../src/app.js';
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

describe('app tool registration', () => {
  beforeEach(() => {
    delete process.env.HEALTH_MONITOR_ALLOW_STDIO;
    delete process.env.HEALTH_MONITOR_STDIO_ALLOWLIST;
    delete process.env.HEALTH_MONITOR_MAX_CONCURRENCY;
    resetDbForTests();
    resetCheckerRuntimeForTests();
  });

  afterAll(() => {
    resetDbForTests();
    resetCheckerRuntimeForTests();
    delete process.env.HEALTH_MONITOR_DB;
    delete process.env.HEALTH_MONITOR_ALLOW_STDIO;
    delete process.env.HEALTH_MONITOR_STDIO_ALLOWLIST;
    delete process.env.HEALTH_MONITOR_MAX_CONCURRENCY;
  });

  it('registers only the supported MCP health monitoring tools', async () => {
    const tools = createToolMap();
    const names = [...tools.keys()].sort();

    expect(names).toEqual([
      'check_all',
      'check_server',
      'get_dashboard',
      'get_monitor_stats',
      'get_report',
      'get_uptime',
      'list_servers',
      'register_server',
      'set_alert',
      'unregister_server'
    ]);
    expect(names.some((name) => name.includes('azure') || name.includes('pipeline'))).toBe(false);

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

    const emptyReport = await getReport.handler({ hours: 24 });
    const emptyDashboard = parseJson(
      await getDashboard.handler({ hours: 24, include_tool_stats: true })
    );
    const emptyMonitorStats = parseJson(await getMonitorStats.handler({}));
    const emptyCheckAll = parseJson(await checkAll.handler({ timeout_ms: 5_000 }));

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
    expect(emptyCheckAll).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: 'NO_SERVERS_REGISTERED',
          remediation: expect.stringContaining('register_server')
        })
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

    const missingAlert = parseJson(
      await setAlert.handler({ name: 'alpha', max_response_time_ms: 100 })
    );
    const missingCheck = parseJson(
      await checkServer.handler({ name: 'missing', timeout_ms: 1000 })
    );

    expect(missingAlert).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: 'SERVER_NOT_FOUND',
          remediation: expect.stringContaining('register_server')
        })
      })
    );
    expect(missingCheck).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: 'SERVER_NOT_FOUND',
          remediation: expect.stringContaining('register_server')
        })
      })
    );
  });

  it('rejects stdio registration and execution when stdio policy is disabled', async () => {
    const tools = createToolMap({ allowStdio: false });
    const registerServer = getTool(tools, 'register_server');
    const checkServer = getTool(tools, 'check_server');

    const disabledRegistration = parseJson(
      await registerServer.handler({
        name: 'local-process',
        type: 'stdio',
        command: 'node',
        args: ['server.js'],
        tags: ['local'],
        alert_on_down: true,
        check_interval_minutes: 5
      })
    );

    expect(disabledRegistration).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: 'STDIO_DISABLED',
          remediation: expect.stringContaining('HEALTH_MONITOR_ALLOW_STDIO=1')
        })
      })
    );

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

    const result = parseJson(
      await registerServer.handler({
        name: 'default-local-process',
        type: 'stdio',
        command: 'node',
        args: ['server.js'],
        tags: ['local'],
        alert_on_down: true,
        check_interval_minutes: 5
      })
    );

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: 'STDIO_DISABLED' })
      })
    );
  });

  it('enforces stdio command allowlists during registration', async () => {
    process.env.HEALTH_MONITOR_STDIO_ALLOWLIST = 'node';
    const tools = createToolMap({ allowStdio: true });
    const registerServer = getTool(tools, 'register_server');

    const rejected = parseJson(
      await registerServer.handler({
        name: 'blocked-local-process',
        type: 'stdio',
        command: 'python',
        args: ['server.py'],
        tags: ['local'],
        alert_on_down: true,
        check_interval_minutes: 5
      })
    );

    expect(rejected).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: 'STDIO_COMMAND_REJECTED',
          remediation: expect.stringContaining('HEALTH_MONITOR_STDIO_ALLOWLIST')
        })
      })
    );

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

  it('bounds interactive check_all concurrency and preserves server order', async () => {
    process.env.HEALTH_MONITOR_MAX_CONCURRENCY = '1';
    const tools = createToolMap();
    const registerServer = getTool(tools, 'register_server');
    const checkAll = getTool(tools, 'check_all');
    let active = 0;
    let maxActive = 0;

    setCheckerRuntimeForTests({
      createClient: () => ({
        connect: async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await new Promise((resolve) => setTimeout(resolve, 15));
          active -= 1;
        },
        listTools: async () => ({ tools: [{ name: 'health' }] }),
        close: async () => undefined
      }),
      createStreamableTransport: (url: URL) => ({ kind: 'streamable', url }) as never,
      createSseTransport: (url: URL) => ({ kind: 'sse', url }) as never,
      fetchImpl: (async () =>
        ({ ok: true, status: 200, statusText: 'OK' }) as Response) as typeof fetch
    });

    for (const name of ['first', 'second', 'third']) {
      await registerServer.handler({
        name,
        type: 'http',
        url: `https://${name}.example/mcp`,
        tags: [],
        alert_on_down: true,
        check_interval_minutes: 5,
        args: []
      });
    }

    const result = parseJson(await checkAll.handler({ timeout_ms: 5_000 }));
    const checks = result.results as Array<{ name: string }>;

    expect(maxActive).toBe(1);
    expect(result.max_concurrency).toBe(1);
    expect(result.queued).toBe(2);
    expect(checks.map((check) => check.name)).toEqual(['first', 'second', 'third']);
  });

  it('creates an MCP server instance with versioned metadata', async () => {
    const server = createMonitorServer();

    expect(server).toBeTruthy();
    await server.close();
  });
});
