process.env.HEALTH_MONITOR_DB = ':memory:';

import { getDb, resetDbForTests } from '../../src/db.js';
import {
  getHttpDashboardReport,
  getHttpTarget,
  getLatestHttpCheck,
  listHttpTargets,
  pruneHttpChecks,
  recordHttpCheck,
  registerHttpTarget,
  unregisterHttpTarget
} from '../../src/http-target-registry.js';
import type { HttpCheckResult, RegisterHttpTargetInput } from '../../src/types.js';

function registration(overrides: Partial<RegisterHttpTargetInput> = {}): RegisterHttpTargetInput {
  return {
    name: 'public-health',
    url: 'https://example.com/health',
    expected_statuses: [200],
    header_assertions: [{ name: 'x-ready', equals: 'yes' }],
    body_contains: ['ready'],
    json_assertions: [{ path: 'status', equals: 'ready' }],
    tls_expiry_days: 30,
    tags: ['production'],
    check_interval_minutes: 5,
    ...overrides
  };
}

function check(
  status: HttpCheckResult['status'],
  overrides: Partial<HttpCheckResult> = {}
): HttpCheckResult {
  return {
    status,
    response_time_ms: 50,
    error_message: status === 'up' ? null : `${status} result`,
    response: {
      status_code: status === 'up' ? 200 : 503,
      final_url: 'https://example.com/health',
      redirect_count: 0,
      content_type: 'application/json',
      content_length: 18,
      tls: {
        subject_cn: 'example.com',
        issuer_cn: 'Example CA',
        valid_from: '2026-07-01T00:00:00.000Z',
        valid_to: '2026-09-01T00:00:00.000Z',
        days_remaining: 40
      }
    },
    assertions: [
      {
        type: 'status',
        passed: status === 'up',
        path: null,
        expected: '200',
        actual: status === 'up' ? 200 : 503,
        message: status === 'up' ? 'matched' : 'failed'
      }
    ],
    ...overrides
  };
}

describe('HTTP target registry', () => {
  beforeEach(() => {
    resetDbForTests();
  });

  afterAll(() => {
    resetDbForTests();
    delete process.env.HEALTH_MONITOR_DB;
    delete process.env.HEALTH_MONITOR_RETENTION_DAYS;
  });

  it('registers, updates, lists, filters, and removes targets without response bodies', () => {
    expect(registerHttpTarget(registration())).toEqual({ registered: true, name: 'public-health' });
    const first = getHttpTarget('public-health');

    expect(first).toEqual(
      expect.objectContaining({
        url: 'https://example.com/health',
        expected_statuses: [200],
        header_assertions: [{ name: 'x-ready', equals: 'yes' }],
        body_contains: ['ready'],
        json_assertions: [{ path: 'status', equals: 'ready' }],
        tls_expiry_days: 30,
        tags: ['production'],
        last_status: 'unknown'
      })
    );
    expect(JSON.stringify(first)).not.toContain('response_body');

    registerHttpTarget(
      registration({
        url: 'https://example.com/ready',
        expected_statuses: [200, 204],
        tags: ['ready'],
        check_interval_minutes: 10
      })
    );
    expect(getHttpTarget('public-health')).toEqual(
      expect.objectContaining({
        url: 'https://example.com/ready',
        expected_statuses: [200, 204],
        tags: ['ready'],
        check_interval_minutes: 10
      })
    );
    expect(listHttpTargets({ tags: ['production'] })).toHaveLength(0);
    expect(listHttpTargets({ tags: ['ready'] })).toHaveLength(1);
    expect(listHttpTargets({ status: 'unknown' })).toHaveLength(1);

    expect(unregisterHttpTarget('public-health')).toEqual({
      unregistered: true,
      name: 'public-health'
    });
    expect(getHttpTarget('public-health')).toBeNull();
  });

  it('records structured history and maintains latest summaries', () => {
    registerHttpTarget(registration());

    recordHttpCheck('public-health', check('down'), 1_000);
    recordHttpCheck(
      'public-health',
      check('down', {
        response_time_ms: 80,
        response: {
          status_code: 500,
          final_url: 'https://example.com/final',
          redirect_count: 1,
          content_type: 'text/plain',
          content_length: 5,
          tls: {
            subject_cn: 'example.com',
            issuer_cn: 'Example CA',
            valid_from: '2026-07-01T00:00:00.000Z',
            valid_to: '2026-07-30T00:00:00.000Z',
            days_remaining: 7
          }
        },
        assertions: [
          {
            type: 'tls_expiry',
            passed: false,
            path: null,
            expected: 30,
            actual: 7,
            message: 'certificate expires soon'
          }
        ]
      }),
      2_000
    );

    expect(getHttpTarget('public-health')).toEqual(
      expect.objectContaining({
        last_status: 'down',
        last_response_time_ms: 80,
        last_status_code: 500,
        last_final_url: 'https://example.com/final',
        last_tls_days_remaining: 7,
        last_failed_assertion_count: 1,
        consecutive_failures: 2
      })
    );
    expect(getLatestHttpCheck('public-health')).toEqual(
      expect.objectContaining({
        timestamp: 2_000,
        status_code: 500,
        tls_days_remaining: 7,
        assertions: [expect.objectContaining({ type: 'tls_expiry', passed: false })]
      })
    );

    recordHttpCheck('public-health', check('up'), 3_000);
    expect(getHttpTarget('public-health')).toEqual(
      expect.objectContaining({ last_status: 'up', consecutive_failures: 0 })
    );
  });

  it('defensively handles malformed stored arrays and maps failures to the down filter', () => {
    registerHttpTarget(registration());
    getDb()
      .prepare(
        `
        UPDATE http_targets
        SET expected_statuses = ?, header_assertions = ?, body_contains = ?,
            json_assertions = ?, tags = ?
        WHERE name = ?
      `
      )
      .run('{bad', '{}', 'null', '"not-an-array"', '["ops"]', 'public-health');

    expect(getHttpTarget('public-health')).toEqual(
      expect.objectContaining({
        expected_statuses: [],
        header_assertions: [],
        body_contains: [],
        json_assertions: [],
        tags: ['ops']
      })
    );

    recordHttpCheck('public-health', check('timeout', { response: null }), 1_000);
    expect(listHttpTargets({ status: 'down' })).toEqual([
      expect.objectContaining({ name: 'public-health', last_status: 'timeout' })
    ]);
    expect(listHttpTargets({ status: 'up' })).toHaveLength(0);
  });

  it('builds dashboard aggregates and prunes expired history', () => {
    process.env.HEALTH_MONITOR_RETENTION_DAYS = '1';
    registerHttpTarget(registration());
    registerHttpTarget(registration({ name: 'other-health', url: 'https://example.org/health' }));

    const now = 3 * 24 * 60 * 60 * 1000;
    recordHttpCheck('public-health', check('up', { response_time_ms: 40 }), now - 2_000);
    recordHttpCheck('public-health', check('down', { response_time_ms: 80 }), now - 1_000);
    recordHttpCheck('other-health', check('up', { response_time_ms: 20 }), now - 3_000);
    getDb()
      .prepare('INSERT INTO http_checks (target_name, timestamp, status) VALUES (?, ?, ?)')
      .run('public-health', now - 2 * 24 * 60 * 60 * 1000, 'up');

    expect(getHttpDashboardReport(24, now)).toEqual([
      expect.objectContaining({
        name: 'other-health',
        current_status: 'up',
        uptime_percent: 100,
        avg_response_time_ms: 20,
        total_checks: 1
      }),
      expect.objectContaining({
        name: 'public-health',
        current_status: 'down',
        latest_status_code: 503,
        uptime_percent: 50,
        avg_response_time_ms: 60,
        total_checks: 2,
        failed_assertions: 1
      })
    ]);

    expect(pruneHttpChecks(now)).toBe(1);
    const count = getDb().prepare('SELECT COUNT(*) AS count FROM http_checks').get() as {
      count: number;
    };
    expect(count.count).toBe(3);
  });
});
