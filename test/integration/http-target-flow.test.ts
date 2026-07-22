process.env.HEALTH_MONITOR_DB = ':memory:';

import { createServer, type RequestListener, type Server } from 'node:http';

import { registerMonitoringTools } from '../../src/app.js';
import { resetDbForTests } from '../../src/db.js';
import {
  resetHttpTargetPolicyRuntimeForTests,
  setHttpTargetPolicyRuntimeForTests
} from '../../src/http-target-policy.js';
import { resetHttpTargetRuntimeForTests } from '../../src/http-targets.js';

type ToolResponse = { content: Array<{ text: string }> };
type ToolHandler = (input: unknown) => Promise<ToolResponse>;

function toolMap(): Map<string, ToolHandler> {
  const tools = new Map<string, ToolHandler>();
  registerMonitoringTools(
    {
      registerTool(name: string, _config: unknown, handler: unknown) {
        tools.set(name, handler as ToolHandler);
        return {};
      }
    },
    { profile: 'full' }
  );
  return tools;
}

function parse(response: ToolResponse): Record<string, unknown> {
  return JSON.parse(response.content[0]?.text ?? '{}') as Record<string, unknown>;
}

async function listen(handler: RequestListener): Promise<{ server: Server; origin: string }> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP address');
  return { server, origin: `http://health.test:${address.port}` };
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
}

describe('generic HTTP target integration flow', () => {
  const servers: Server[] = [];

  beforeEach(() => {
    resetDbForTests();
    resetHttpTargetPolicyRuntimeForTests();
    resetHttpTargetRuntimeForTests();
    delete process.env.HEALTH_MONITOR_HTTP_TARGET_ALLOWLIST;
  });

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => close(server)));
  });

  afterAll(() => {
    resetDbForTests();
    resetHttpTargetPolicyRuntimeForTests();
    resetHttpTargetRuntimeForTests();
    delete process.env.HEALTH_MONITOR_DB;
    delete process.env.HEALTH_MONITOR_HTTP_TARGET_ALLOWLIST;
  });

  it('registers, checks, lists, reports, and removes an asserted HTTP target', async () => {
    const { server, origin } = await listen((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json', 'x-ready': 'yes' });
      response.end(JSON.stringify({ status: 'ready', service: { version: 4 } }));
    });
    servers.push(server);
    process.env.HEALTH_MONITOR_HTTP_TARGET_ALLOWLIST = origin;
    setHttpTargetPolicyRuntimeForTests({
      lookup: async () => [{ address: '127.0.0.1', family: 4 }]
    });

    const tools = toolMap();
    const register = tools.get('register_http_target');
    const check = tools.get('check_http_target');
    const list = tools.get('list_http_targets');
    const dashboard = tools.get('get_dashboard');
    const report = tools.get('get_report');
    const remove = tools.get('unregister_http_target');

    if (!register || !check || !list || !dashboard || !report || !remove) {
      throw new Error('Expected HTTP integration tools were not registered');
    }

    expect(
      parse(
        await register({
          name: 'service-health',
          url: `${origin}/health`,
          expected_statuses: [200],
          header_assertions: [{ name: 'x-ready', equals: 'yes' }],
          body_contains: ['ready'],
          json_assertions: [
            { path: 'status', equals: 'ready' },
            { path: 'service.version', equals: 4 }
          ],
          tags: ['integration'],
          check_interval_minutes: 5
        })
      )
    ).toEqual(expect.objectContaining({ registered: true, name: 'service-health' }));

    const checked = parse(await check({ name: 'service-health', timeout_ms: 5_000 }));
    expect(checked).toEqual(
      expect.objectContaining({
        status: 'up',
        response: expect.objectContaining({ status_code: 200, final_url: `${origin}/health` }),
        assertions: expect.arrayContaining([
          expect.objectContaining({ type: 'header', passed: true }),
          expect.objectContaining({ type: 'body_contains', passed: true }),
          expect.objectContaining({ type: 'json_equals', path: 'service.version', passed: true })
        ])
      })
    );
    expect(checked).not.toHaveProperty('body');
    expect(parse(await list({ tags: ['integration'] }))).toEqual(
      expect.objectContaining({ count: 1 })
    );
    expect(parse(await dashboard({ hours: 24, include_tool_stats: true }))).toEqual(
      expect.objectContaining({
        http_targets: [expect.objectContaining({ name: 'service-health', latest_status_code: 200 })]
      })
    );
    expect((await report({ hours: 24 })).content[0]?.text).toContain('## HTTP Targets');
    expect(parse(await remove({ name: 'service-health' }))).toEqual(
      expect.objectContaining({ unregistered: true, name: 'service-health' })
    );
  });
});
