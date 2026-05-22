process.env.HEALTH_MONITOR_DB = ':memory:';

import { registerMonitoringTools } from '../../src/app.js';
import { resetCheckerRuntimeForTests, setCheckerRuntimeForTests } from '../../src/checker.js';
import { resetDbForTests } from '../../src/db.js';

type ToolCall = {
  name: string;
  handler: (input: unknown) => Promise<{ content: Array<{ text: string }> }>;
};

function createToolMap(): Map<string, ToolCall['handler']> {
  const calls = new Map<string, ToolCall['handler']>();

  registerMonitoringTools({
    registerTool(name: string, _config: unknown, handler: unknown) {
      calls.set(name, handler as ToolCall['handler']);
      return {};
    }
  });

  return calls;
}

describe('health monitoring integration flow', () => {
  beforeEach(() => {
    resetDbForTests();
    resetCheckerRuntimeForTests();
  });

  afterAll(() => {
    resetDbForTests();
    resetCheckerRuntimeForTests();
    delete process.env.HEALTH_MONITOR_DB;
  });

  it('registers, checks, and reports on a server through tool handlers', async () => {
    setCheckerRuntimeForTests({
      createClient: () => ({
        connect: async () => undefined,
        listTools: async () => ({ tools: [{ name: 'alpha' }, { name: 'beta' }] }),
        close: async () => undefined
      }),
      createStreamableTransport: (url: URL) => ({ kind: 'streamable', url }) as never,
      createSseTransport: (url: URL) => ({ kind: 'sse', url }) as never,
      fetchImpl: async () =>
        ({
          ok: true,
          status: 200,
          statusText: 'OK'
        }) as Response
    });

    const tools = createToolMap();
    const registerServer = tools.get('register_server');
    const checkServer = tools.get('check_server');
    const getUptime = tools.get('get_uptime');
    const getDashboard = tools.get('get_dashboard');
    const getReport = tools.get('get_report');

    if (!registerServer || !checkServer || !getUptime || !getDashboard || !getReport) {
      throw new Error('Expected handlers were not registered');
    }

    await registerServer({
      name: 'integration-server',
      type: 'http',
      url: 'https://example.com/mcp',
      tags: ['integration'],
      alert_on_down: true,
      check_interval_minutes: 5,
      args: []
    });

    const checkResult = JSON.parse(
      (await checkServer({ name: 'integration-server', timeout_ms: 5_000 })).content[0]?.text ??
        '{}'
    ) as { status: string; tool_count: number };
    const uptimeResult = JSON.parse(
      (await getUptime({ name: 'integration-server', hours: 24 })).content[0]?.text ?? '{}'
    ) as { total_checks: number; p95_response_time_ms: number | null };
    const dashboardResult = JSON.parse(
      (await getDashboard({ hours: 24, include_tool_stats: true })).content[0]?.text ?? '{}'
    ) as { servers: Array<{ name: string; tool_count: number | null }> };
    const reportText = (await getReport({ hours: 24 })).content[0]?.text ?? '';

    expect(checkResult.status).toBe('up');
    expect(checkResult.tool_count).toBe(2);
    expect(uptimeResult.total_checks).toBe(1);
    expect(uptimeResult.p95_response_time_ms).not.toBeNull();
    expect(dashboardResult.servers[0]).toEqual(
      expect.objectContaining({
        name: 'integration-server',
        tool_count: 2
      })
    );
    expect(reportText).toContain('# MCP Health Report');
    expect(reportText).toContain('integration-server');
  });
});
