import { jest } from '@jest/globals';
import { createServer, type RequestListener, type Server } from 'node:http';

import {
  checkHttpTarget,
  resetHttpTargetRuntimeForTests,
  setHttpTargetRuntimeForTests
} from '../../src/http-targets.js';
import {
  resetHttpTargetPolicyRuntimeForTests,
  setHttpTargetPolicyRuntimeForTests
} from '../../src/http-target-policy.js';
import type { RegisteredHttpTarget } from '../../src/types.js';

function createTarget(overrides: Partial<RegisteredHttpTarget> = {}): RegisteredHttpTarget {
  return {
    name: 'public-health',
    url: 'https://public.example/health',
    expected_statuses: [200],
    header_assertions: [],
    body_contains: [],
    json_assertions: [],
    tls_expiry_days: null,
    tags: [],
    check_interval_minutes: 5,
    created_at: 0,
    last_checked: null,
    last_status: 'unknown',
    last_response_time_ms: null,
    last_status_code: null,
    last_final_url: null,
    last_tls_days_remaining: null,
    last_failed_assertion_count: 0,
    consecutive_failures: 0,
    ...overrides
  };
}

async function listen(handler: RequestListener): Promise<{ server: Server; origin: string }> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP address');
  return { server, origin: `http://test.local:${address.port}` };
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
}

describe('generic HTTP target checker', () => {
  const originalAllowlist = process.env.HEALTH_MONITOR_HTTP_TARGET_ALLOWLIST;
  const servers: Server[] = [];

  beforeEach(() => {
    resetHttpTargetRuntimeForTests();
    resetHttpTargetPolicyRuntimeForTests();
  });

  afterEach(async () => {
    resetHttpTargetRuntimeForTests();
    resetHttpTargetPolicyRuntimeForTests();
    if (originalAllowlist === undefined) delete process.env.HEALTH_MONITOR_HTTP_TARGET_ALLOWLIST;
    else process.env.HEALTH_MONITOR_HTTP_TARGET_ALLOWLIST = originalAllowlist;
    await Promise.all(servers.splice(0).map((server) => close(server)));
    jest.useRealTimers();
  });

  it('checks a pinned endpoint and evaluates status, header, body, and JSON assertions', async () => {
    const { server, origin } = await listen((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json', 'x-ready': 'yes' });
      response.end(
        JSON.stringify({ status: 'ready', nested: { count: 3 }, message: 'service ready' })
      );
    });
    servers.push(server);
    process.env.HEALTH_MONITOR_HTTP_TARGET_ALLOWLIST = origin;
    setHttpTargetPolicyRuntimeForTests({
      lookup: async () => [{ address: '127.0.0.1', family: 4 }]
    });

    const result = await checkHttpTarget(
      createTarget({
        url: `${origin}/health`,
        header_assertions: [{ name: 'x-ready', equals: 'yes' }],
        body_contains: ['service ready'],
        json_assertions: [
          { path: 'status', equals: 'ready' },
          { path: 'nested.count', equals: 3 }
        ]
      }),
      5_000,
      { profile: 'full' }
    );

    expect(result.status).toBe('up');
    expect(result.error_message).toBeNull();
    expect(result.response).toEqual(
      expect.objectContaining({
        status_code: 200,
        final_url: `${origin}/health`,
        redirect_count: 0,
        content_type: 'application/json',
        tls: null
      })
    );
    expect(result.assertions).toHaveLength(5);
    expect(result.assertions.every((assertion) => assertion.passed)).toBe(true);
    expect(result).not.toHaveProperty('body');
    expect(result.response).not.toHaveProperty('body');
  });

  it('returns down with structured assertion failures', async () => {
    const { server, origin } = await listen((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json', 'x-ready': 'no' });
      response.end(JSON.stringify({ status: 'starting' }));
    });
    servers.push(server);
    process.env.HEALTH_MONITOR_HTTP_TARGET_ALLOWLIST = origin;
    setHttpTargetPolicyRuntimeForTests({
      lookup: async () => [{ address: '127.0.0.1', family: 4 }]
    });

    const result = await checkHttpTarget(
      createTarget({
        url: `${origin}/health`,
        expected_statuses: [201],
        header_assertions: [{ name: 'x-ready', equals: 'yes' }],
        body_contains: ['ready'],
        json_assertions: [{ path: 'status', equals: 'ready' }]
      }),
      5_000,
      { profile: 'full' }
    );

    expect(result.status).toBe('down');
    expect(result.assertions.filter((assertion) => !assertion.passed)).toHaveLength(4);
    expect(result.error_message).toContain('HTTP status 200');
  });

  it('returns an error for malformed required JSON and oversized response bodies', async () => {
    const malformed = await listen((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{not-json');
    });
    const oversized = await listen((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end('x'.repeat(262_145));
    });
    servers.push(malformed.server, oversized.server);
    process.env.HEALTH_MONITOR_HTTP_TARGET_ALLOWLIST = `${malformed.origin},${oversized.origin}`;
    setHttpTargetPolicyRuntimeForTests({
      lookup: async () => [{ address: '127.0.0.1', family: 4 }]
    });

    const invalidJson = await checkHttpTarget(
      createTarget({
        url: `${malformed.origin}/health`,
        json_assertions: [{ path: 'status', equals: 'ready' }]
      }),
      5_000,
      { profile: 'full' }
    );
    const tooLarge = await checkHttpTarget(
      createTarget({ url: `${oversized.origin}/health` }),
      5_000,
      { profile: 'full' }
    );

    expect(invalidJson).toEqual(
      expect.objectContaining({ status: 'error', error_message: expect.stringContaining('JSON') })
    );
    expect(tooLarge).toEqual(
      expect.objectContaining({
        status: 'error',
        error_message: expect.stringContaining('262144')
      })
    );
  });

  it('revalidates redirects and rejects a fourth redirect', async () => {
    setHttpTargetPolicyRuntimeForTests({
      lookup: async (hostname) => [
        { address: hostname === 'blocked.internal' ? '10.0.0.5' : '8.8.8.8', family: 4 }
      ]
    });
    setHttpTargetRuntimeForTests({
      request: async (resolved) => ({
        status_code: 302,
        headers: {
          location: resolved.url.includes('unsafe') ? 'http://blocked.internal/' : '/again'
        },
        body: Buffer.alloc(0),
        tls: null
      })
    });

    const unsafe = await checkHttpTarget(
      createTarget({ url: 'https://public.example/unsafe' }),
      5_000,
      { profile: 'full' }
    );
    const loop = await checkHttpTarget(
      createTarget({ url: 'https://public.example/loop' }),
      5_000,
      { profile: 'full' }
    );

    expect(unsafe).toEqual(
      expect.objectContaining({
        status: 'error',
        error_message: expect.stringContaining('non-public network')
      })
    );
    expect(loop).toEqual(
      expect.objectContaining({
        status: 'error',
        error_message: expect.stringContaining('redirect limit')
      })
    );
  });

  it('returns timeout for an unresolved request', async () => {
    const { server, origin } = await listen(() => undefined);
    servers.push(server);
    process.env.HEALTH_MONITOR_HTTP_TARGET_ALLOWLIST = origin;
    setHttpTargetPolicyRuntimeForTests({
      lookup: async () => [{ address: '127.0.0.1', family: 4 }]
    });

    const result = await checkHttpTarget(createTarget({ url: `${origin}/slow` }), 50, {
      profile: 'full'
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'timeout',
        error_message: expect.stringContaining('timed out')
      })
    );
  });

  it('enforces the total timeout even when the response keeps streaming data', async () => {
    const { server, origin } = await listen((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/plain' });
      let sent = 0;
      const timer = setInterval(() => {
        response.write('x');
        sent += 1;
        if (sent === 8) {
          clearInterval(timer);
          response.end();
        }
      }, 20);
      response.on('close', () => clearInterval(timer));
    });
    servers.push(server);
    process.env.HEALTH_MONITOR_HTTP_TARGET_ALLOWLIST = origin;
    setHttpTargetPolicyRuntimeForTests({
      lookup: async () => [{ address: '127.0.0.1', family: 4 }]
    });

    const result = await checkHttpTarget(createTarget({ url: `${origin}/stream` }), 55, {
      profile: 'full'
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'timeout',
        error_message: expect.stringContaining('timed out')
      })
    );
  });

  it('does not treat an object JSON value as equal to null', async () => {
    const { server, origin } = await listen((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ node: {} }));
    });
    servers.push(server);
    process.env.HEALTH_MONITOR_HTTP_TARGET_ALLOWLIST = origin;
    setHttpTargetPolicyRuntimeForTests({
      lookup: async () => [{ address: '127.0.0.1', family: 4 }]
    });

    const result = await checkHttpTarget(
      createTarget({
        url: `${origin}/json`,
        json_assertions: [{ path: 'node', equals: null }]
      }),
      5_000,
      { profile: 'full' }
    );

    expect(result.status).toBe('down');
    expect(result.assertions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'json_equals', path: 'node', passed: false })
      ])
    );
  });

  it('normalizes repeated headers and traverses JSON arrays safely', async () => {
    const { server, origin } = await listen((_request, response) => {
      response.setHeader('set-cookie', ['a=1', 'b=2']);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ items: [{ status: 'ready' }] }));
    });
    servers.push(server);
    process.env.HEALTH_MONITOR_HTTP_TARGET_ALLOWLIST = origin;
    setHttpTargetPolicyRuntimeForTests({
      lookup: async () => [{ address: '127.0.0.1', family: 4 }]
    });

    const result = await checkHttpTarget(
      createTarget({
        url: `${origin}/arrays`,
        header_assertions: [{ name: 'set-cookie', equals: 'a=1, b=2' }],
        json_assertions: [
          { path: 'items.0.status', equals: 'ready' },
          { path: 'items.2.status', equals: 'ready' },
          { path: 'missing.value', equals: null }
        ]
      }),
      5_000,
      { profile: 'full' }
    );

    expect(result.status).toBe('down');
    expect(result.assertions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'header', path: 'set-cookie', passed: true }),
        expect.objectContaining({ type: 'json_equals', path: 'items.0.status', passed: true }),
        expect.objectContaining({ type: 'json_equals', path: 'items.2.status', passed: false }),
        expect.objectContaining({ type: 'json_equals', path: 'missing.value', passed: false })
      ])
    );
  });

  it('stops before policy resolution when the total budget is already exhausted', async () => {
    let clockCalls = 0;
    const resolve = jest.fn(async () => {
      throw new Error('resolution should not run');
    });
    setHttpTargetRuntimeForTests({
      now: () => {
        clockCalls += 1;
        return clockCalls === 1 ? 0 : 100;
      },
      resolve
    });

    const result = await checkHttpTarget(createTarget(), 50, { profile: 'full' });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'timeout',
        error_message: expect.stringContaining('timed out after 50ms')
      })
    );
    expect(resolve).not.toHaveBeenCalled();
  });

  it('reports TLS details and fails an expiry threshold without returning certificate chains', async () => {
    setHttpTargetPolicyRuntimeForTests({
      lookup: async () => [{ address: '8.8.8.8', family: 4 }]
    });
    setHttpTargetRuntimeForTests({
      request: async () => ({
        status_code: 200,
        headers: { 'content-type': 'text/plain' },
        body: Buffer.from('ok'),
        tls: {
          subject_cn: 'public.example',
          issuer_cn: 'Example CA',
          valid_from: '2026-07-01T00:00:00.000Z',
          valid_to: '2026-07-28T00:00:00.000Z',
          days_remaining: 5
        }
      })
    });

    const result = await checkHttpTarget(createTarget({ tls_expiry_days: 10 }), 5_000, {
      profile: 'full'
    });

    expect(result.status).toBe('down');
    expect(result.response?.tls).toEqual(
      expect.objectContaining({ days_remaining: 5, issuer_cn: 'Example CA' })
    );
    expect(result.assertions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'tls_expiry', passed: false, expected: 10, actual: 5 })
      ])
    );
  });
});
