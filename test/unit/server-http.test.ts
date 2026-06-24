import http from 'node:http';

import { jest } from '@jest/globals';

import {
  createHttpServer,
  InMemoryRateLimiter,
  validateHttpStartupConfig
} from '../../src/server-http.js';

type HttpResult = {
  statusCode: number;
  body: string;
  headers: http.IncomingHttpHeaders;
};

async function startServer(server: http.Server): Promise<number> {
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve test server port');
  }

  return address.port;
}

async function request(
  port: number,
  path: string,
  method: string,
  body?: string,
  headers: Record<string, string> = {}
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: body
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(body),
              ...headers
            }
          : Object.keys(headers).length
            ? headers
            : undefined
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
            headers: res.headers
          });
        });
      }
    );

    req.on('error', reject);

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

function initializeRequestBody(id = 1): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    id,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: {
        name: 'server-http-test',
        version: '1.0.0'
      }
    }
  });
}

function toolsListRequestBody(id = 2): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    id,
    method: 'tools/list'
  });
}

describe('server-http', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('serves a health response', async () => {
    const server = createHttpServer();
    const port = await startServer(server);

    try {
      const result = await request(port, '/health', 'GET');

      expect(result.statusCode).toBe(200);
      expect(result.body).toContain('"status":"ok"');
      expect(result.body).toContain('"version"');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('rejects MCP requests when no HTTP token is configured', async () => {
    const server = createHttpServer({ authToken: undefined });
    const port = await startServer(server);

    try {
      const result = await request(
        port,
        '/mcp',
        'POST',
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list'
        })
      );

      expect(result.statusCode).toBe(503);
      expect(result.body).toContain('HEALTH_MONITOR_HTTP_TOKEN');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('rejects MCP requests with missing or wrong bearer tokens', async () => {
    const server = createHttpServer({ authToken: 'local-test-token' });
    const port = await startServer(server);

    try {
      const missing = await request(
        port,
        '/mcp',
        'POST',
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list'
        })
      );
      const wrong = await request(
        port,
        '/mcp',
        'POST',
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list'
        }),
        {
          Authorization: 'Bearer wrong-token'
        }
      );

      expect(missing.statusCode).toBe(401);
      expect(wrong.statusCode).toBe(401);
      expect(wrong.body).not.toContain('wrong-token');
      expect(wrong.headers['www-authenticate']).toBe('Bearer');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('accepts MCP requests with the configured bearer token', async () => {
    const server = createHttpServer({
      authToken: 'local-test-token',
      monitorFactory: () => ({
        connect: async () => undefined,
        close: async () => undefined
      })
    });
    const port = await startServer(server);

    try {
      const result = await request(
        port,
        '/mcp',
        'POST',
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list'
        }),
        {
          Authorization: 'Bearer local-test-token'
        }
      );

      expect(result.statusCode).not.toBe(401);
      expect(result.statusCode).not.toBe(503);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('allows loopback startup without a remote-safe profile but rejects unsafe public startup', () => {
    expect(() =>
      validateHttpStartupConfig({
        host: '127.0.0.1',
        authToken: undefined,
        profile: 'full'
      })
    ).not.toThrow();

    expect(() =>
      validateHttpStartupConfig({
        host: '0.0.0.0',
        authToken: undefined,
        profile: 'full'
      })
    ).toThrow('HEALTH_MONITOR_HTTP_TOKEN');

    expect(() =>
      validateHttpStartupConfig({
        host: '0.0.0.0',
        authToken: 'token',
        profile: 'full'
      })
    ).toThrow('remote-safe');

    expect(() =>
      validateHttpStartupConfig({
        host: '0.0.0.0',
        authToken: 'token',
        profile: 'remote-safe'
      })
    ).toThrow('HEALTH_MONITOR_HTTP_ORIGIN_ALLOWLIST');

    expect(() =>
      validateHttpStartupConfig({
        host: '0.0.0.0',
        authToken: 'token',
        profile: 'remote-safe',
        originAllowlist: ['https://client.example']
      })
    ).not.toThrow();
  });

  it('rejects unsupported MCP methods', async () => {
    const server = createHttpServer();
    const port = await startServer(server);

    try {
      const result = await request(port, '/mcp', 'GET');

      expect(result.statusCode).toBe(405);
      expect(result.headers.allow).toBe('POST');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('returns not found for unsupported paths', async () => {
    const server = createHttpServer();
    const port = await startServer(server);

    try {
      const result = await request(port, '/missing', 'GET');

      expect(result.statusCode).toBe(404);
      expect(result.body).toContain('Not Found');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('rejects MCP requests from origins outside the configured allowlist', async () => {
    const server = createHttpServer({
      authToken: 'local-test-token',
      originAllowlist: ['https://allowed.example']
    });
    const port = await startServer(server);

    try {
      const result = await request(
        port,
        '/mcp',
        'POST',
        JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
        {
          Authorization: 'Bearer local-test-token',
          Origin: 'https://blocked.example'
        }
      );

      expect(result.statusCode).toBe(403);
      expect(result.body).toContain('Forbidden Origin');
      expect(result.headers.vary).toBe('Origin');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('rejects explicit MCP Accept headers that cannot receive JSON or event streams', async () => {
    const server = createHttpServer({ authToken: 'local-test-token' });
    const port = await startServer(server);

    try {
      const result = await request(
        port,
        '/mcp',
        'POST',
        JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
        {
          Authorization: 'Bearer local-test-token',
          Accept: 'text/html'
        }
      );

      expect(result.statusCode).toBe(406);
      expect(result.body).toContain('Not Acceptable');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('creates and reuses stateful MCP sessions', async () => {
    const server = createHttpServer({
      authToken: 'local-test-token',
      statefulSessions: true
    });
    const port = await startServer(server);

    try {
      const initialized = await request(port, '/mcp', 'POST', initializeRequestBody(), {
        Authorization: 'Bearer local-test-token',
        Accept: 'application/json, text/event-stream'
      });
      const sessionId = initialized.headers['mcp-session-id'];

      expect(initialized.statusCode).toBe(200);
      expect(typeof sessionId).toBe('string');

      const listed = await request(port, '/mcp', 'POST', toolsListRequestBody(), {
        Authorization: 'Bearer local-test-token',
        Accept: 'application/json, text/event-stream',
        'mcp-session-id': String(sessionId)
      });

      expect(listed.statusCode).toBe(200);
      expect(listed.body).toContain('tools');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('rejects missing or expired stateful MCP sessions deterministically', async () => {
    let now = 1_000;
    const server = createHttpServer({
      authToken: 'local-test-token',
      statefulSessions: true,
      sessionTtlMs: 1_000,
      now: () => now
    });
    const port = await startServer(server);

    try {
      const missing = await request(port, '/mcp', 'POST', toolsListRequestBody(), {
        Authorization: 'Bearer local-test-token',
        Accept: 'application/json, text/event-stream'
      });
      expect(missing.statusCode).toBe(400);
      expect(missing.body).toContain('session ID is required');

      const initialized = await request(port, '/mcp', 'POST', initializeRequestBody(), {
        Authorization: 'Bearer local-test-token',
        Accept: 'application/json, text/event-stream'
      });
      const sessionId = String(initialized.headers['mcp-session-id']);
      expect(sessionId).toBeTruthy();

      now = 2_001;
      const expired = await request(port, '/mcp', 'POST', toolsListRequestBody(), {
        Authorization: 'Bearer local-test-token',
        Accept: 'application/json, text/event-stream',
        'mcp-session-id': sessionId
      });

      expect(expired.statusCode).toBe(404);
      expect(expired.body).toContain('not found or expired');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('evicts the oldest stateful MCP session when the max session cap is reached', async () => {
    const server = createHttpServer({
      authToken: 'local-test-token',
      statefulSessions: true,
      maxSessions: 1
    });
    const port = await startServer(server);

    try {
      const first = await request(port, '/mcp', 'POST', initializeRequestBody(1), {
        Authorization: 'Bearer local-test-token',
        Accept: 'application/json, text/event-stream'
      });
      const firstSessionId = String(first.headers['mcp-session-id']);

      const second = await request(port, '/mcp', 'POST', initializeRequestBody(2), {
        Authorization: 'Bearer local-test-token',
        Accept: 'application/json, text/event-stream'
      });
      const secondSessionId = String(second.headers['mcp-session-id']);

      expect(firstSessionId).not.toEqual(secondSessionId);

      const evicted = await request(port, '/mcp', 'POST', toolsListRequestBody(3), {
        Authorization: 'Bearer local-test-token',
        Accept: 'application/json, text/event-stream',
        'mcp-session-id': firstSessionId
      });

      expect(evicted.statusCode).toBe(404);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('returns parse errors for invalid JSON payloads', async () => {
    const server = createHttpServer({ authToken: 'local-test-token' });
    const port = await startServer(server);

    try {
      const result = await request(port, '/mcp', 'POST', '{invalid json', {
        Authorization: 'Bearer local-test-token'
      });

      expect(result.statusCode).toBe(400);
      expect(result.body).toContain('Parse error');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('enforces per-IP rate limiting for MCP requests', async () => {
    const server = createHttpServer({
      authToken: 'local-test-token',
      rateLimiter: new InMemoryRateLimiter(1, 60_000, () => 1_000)
    });
    const port = await startServer(server);

    try {
      const first = await request(port, '/mcp', 'POST', '{invalid json', {
        Authorization: 'Bearer local-test-token'
      });
      const second = await request(port, '/mcp', 'POST', '{invalid json', {
        Authorization: 'Bearer local-test-token'
      });

      expect(first.statusCode).toBe(400);
      expect(second.statusCode).toBe(429);
      expect(second.headers['retry-after']).toBeDefined();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('rejects oversized MCP payloads', async () => {
    const server = createHttpServer({ authToken: 'local-test-token' });
    const port = await startServer(server);
    const body = JSON.stringify({
      payload: 'x'.repeat(1024 * 1024)
    });

    try {
      const result = await request(port, '/mcp', 'POST', body, {
        Authorization: 'Bearer local-test-token'
      });

      expect(result.statusCode).toBe(413);
      expect(result.body).toContain('Payload too large');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('returns internal errors when server connection setup fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const server = createHttpServer({
      authToken: 'local-test-token',
      monitorFactory: () => ({
        connect: async () => {
          throw new Error('boom');
        },
        close: async () => undefined
      })
    });
    const port = await startServer(server);

    try {
      const result = await request(
        port,
        '/mcp',
        'POST',
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list'
        }),
        {
          Authorization: 'Bearer local-test-token'
        }
      );

      expect(result.statusCode).toBe(500);
      expect(result.body).toContain('Internal error');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
