process.env.HEALTH_MONITOR_DB = ':memory:';

import {
  getDashboardReport,
  getServer,
  getUptimeHistory,
  listServers,
  pruneHealthChecks,
  recordHealthCheck,
  registerServer,
  unregisterServer
} from '../../src/registry.js';
import { getDb, resetDbForTests } from '../../src/db.js';

describe('registry', () => {
  beforeEach(() => {
    resetDbForTests();
    delete process.env.HEALTH_MONITOR_RETENTION_DAYS;
  });

  afterEach(() => {
    delete process.env.HEALTH_MONITOR_RETENTION_DAYS;
  });

  it('registers and retrieves a server', () => {
    registerServer({
      name: 'test-http-server',
      type: 'http',
      url: 'https://example.com/mcp',
      tags: ['test'],
      alert_on_down: true,
      check_interval_minutes: 5,
      args: []
    });

    const server = getServer('test-http-server');

    expect(server?.name).toBe('test-http-server');
    expect(server?.type).toBe('http');
    expect(server?.tags).toEqual(['test']);
  });

  it('lists servers with tag filter', () => {
    registerServer({
      name: 'srv-a',
      type: 'http',
      url: 'https://a.example/mcp',
      tags: ['devops'],
      alert_on_down: true,
      check_interval_minutes: 5,
      args: []
    });
    registerServer({
      name: 'srv-b',
      type: 'http',
      url: 'https://b.example/mcp',
      tags: ['database'],
      alert_on_down: true,
      check_interval_minutes: 5,
      args: []
    });

    const filtered = listServers({ tags: ['devops'] });

    expect(filtered.map((server: { name: string }) => server.name)).toEqual(['srv-a']);
  });

  it('records health checks and tracks consecutive failures', () => {
    registerServer({
      name: 'flaky-server',
      type: 'http',
      url: 'https://flaky.example/mcp',
      tags: [],
      alert_on_down: true,
      check_interval_minutes: 5,
      args: []
    });

    recordHealthCheck('flaky-server', {
      status: 'down',
      response_time_ms: null,
      tool_count: null,
      error_message: 'connection refused',
      tools: null
    });
    recordHealthCheck('flaky-server', {
      status: 'down',
      response_time_ms: null,
      tool_count: null,
      error_message: 'connection refused',
      tools: null
    });

    const server = getServer('flaky-server');

    expect(server?.consecutive_failures).toBe(2);
  });

  it('resets consecutive failures when server comes back up', () => {
    registerServer({
      name: 'recovering-server',
      type: 'http',
      url: 'https://recovering.example/mcp',
      tags: [],
      alert_on_down: true,
      check_interval_minutes: 5,
      args: []
    });

    recordHealthCheck('recovering-server', {
      status: 'down',
      response_time_ms: null,
      tool_count: null,
      error_message: 'timeout',
      tools: null
    });
    recordHealthCheck('recovering-server', {
      status: 'up',
      response_time_ms: 150,
      tool_count: 5,
      error_message: null,
      tools: ['tool1', 'tool2']
    });

    const server = getServer('recovering-server');

    expect(server?.consecutive_failures).toBe(0);
  });

  it('returns uptime history and dashboard metrics', () => {
    registerServer({
      name: 'metrics-server',
      type: 'http',
      url: 'https://metrics.example/mcp',
      tags: ['ops'],
      alert_on_down: false,
      check_interval_minutes: 10,
      args: []
    });

    recordHealthCheck('metrics-server', {
      status: 'up',
      response_time_ms: 100,
      tool_count: 2,
      error_message: null,
      tools: ['a', 'b']
    });
    recordHealthCheck('metrics-server', {
      status: 'down',
      response_time_ms: null,
      tool_count: null,
      error_message: 'boom',
      tools: null
    });
    recordHealthCheck('metrics-server', {
      status: 'up',
      response_time_ms: 200,
      tool_count: 3,
      error_message: null,
      tools: ['a', 'b', 'c']
    });

    const history = getUptimeHistory('metrics-server', 24);
    const dashboard = getDashboardReport(24);

    expect(history).toHaveLength(3);
    expect(dashboard).toEqual([
      expect.objectContaining({
        name: 'metrics-server',
        uptime_percent: 67,
        avg_response_time_ms: 150,
        p50_response_time_ms: 200,
        p95_response_time_ms: 200,
        total_checks: 3
      })
    ]);
  });

  it('unregisters a server', () => {
    registerServer({
      name: 'to-remove',
      type: 'http',
      url: 'https://remove.example/mcp',
      tags: [],
      alert_on_down: false,
      check_interval_minutes: 5,
      args: []
    });

    unregisterServer('to-remove');

    expect(getServer('to-remove')).toBeNull();
  });

  it('prunes health checks older than the configured retention window', () => {
    registerServer({
      name: 'retention-server',
      type: 'http',
      url: 'https://retention.example/mcp',
      tags: [],
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
    ).run('retention-server', now - 40 * 24 * 60 * 60 * 1000, 'up', 10, 1, null, null);
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
    ).run('retention-server', now, 'up', 11, 1, null, null);

    process.env.HEALTH_MONITOR_RETENTION_DAYS = '30';
    const pruned = pruneHealthChecks(now);
    const remaining = db.prepare('SELECT COUNT(*) AS count FROM health_checks').get() as {
      count: number;
    };

    expect(pruned).toBe(1);
    expect(remaining.count).toBe(1);
  });
});
