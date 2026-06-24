import http from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

import { createMonitorServer } from './app.js';
import {
  getBoundedIntegerEnv,
  getRuntimeProfile,
  isRemoteSafeProfile,
  type RuntimeProfile
} from './config.js';
import { log } from './logging.js';
import { createRuntimePolicy } from './policy.js';
import { startScheduler, stopScheduler } from './scheduler.js';
import { MONITOR_VERSION } from './version.js';

const DEFAULT_PORT = Number(process.env.PORT ?? 3000);
const DEFAULT_HOST = process.env.HOST?.trim() || '127.0.0.1';
const MAX_REQUEST_BODY_BYTES = 1024 * 1024;
const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000;
const DEFAULT_MAX_SESSIONS = 100;

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

type MonitorServer = {
  connect: (transport: Transport) => Promise<void>;
  close: () => Promise<void>;
};

type StatefulSession = {
  server: MonitorServer;
  transport: StreamableHTTPServerTransport;
  expiresAt: number;
};

type SessionRuntimeOptions = {
  ttlMs?: number | undefined;
  maxSessions?: number | undefined;
  now?: (() => number) | undefined;
};

export class HttpSessionRegistry {
  private readonly sessions = new Map<string, StatefulSession>();
  private readonly ttlMs: number;
  private readonly maxSessions: number;
  private readonly now: () => number;

  public constructor(options: SessionRuntimeOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_SESSION_TTL_MS;
    this.maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS;
    this.now = options.now ?? (() => Date.now());
  }

  public get size(): number {
    this.pruneExpired();
    return this.sessions.size;
  }

  public get(sessionId: string): StatefulSession | null {
    this.pruneExpired();
    const session = this.sessions.get(sessionId);

    if (!session) {
      return null;
    }

    session.expiresAt = this.now() + this.ttlMs;
    return session;
  }

  public create(monitorFactory: () => MonitorServer): StatefulSession {
    const server = monitorFactory();
    let activeSessionId: string | undefined;

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId: string) => {
        activeSessionId = sessionId;
        this.register(sessionId, {
          server,
          transport,
          expiresAt: this.now() + this.ttlMs
        });
      },
      onsessionclosed: (sessionId: string) => {
        void this.close(sessionId);
      }
    });

    transport.onclose = () => {
      if (activeSessionId) {
        this.sessions.delete(activeSessionId);
      }
    };

    return {
      server,
      transport,
      expiresAt: this.now() + this.ttlMs
    };
  }

  public async close(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return;
    }

    this.sessions.delete(sessionId);
    await Promise.allSettled([session.transport.close(), session.server.close()]);
  }

  public async closeAll(): Promise<void> {
    const sessionIds = [...this.sessions.keys()];
    await Promise.allSettled(sessionIds.map((sessionId) => this.close(sessionId)));
  }

  private register(sessionId: string, session: StatefulSession): void {
    this.pruneExpired();

    while (this.sessions.size >= this.maxSessions) {
      const oldestSessionId = [...this.sessions.entries()].sort(
        ([, left], [, right]) => left.expiresAt - right.expiresAt
      )[0]?.[0];

      if (!oldestSessionId) {
        break;
      }

      void this.close(oldestSessionId);
    }

    this.sessions.set(sessionId, session);
  }

  private pruneExpired(): void {
    const currentTime = this.now();

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.expiresAt <= currentTime) {
        void this.close(sessionId);
      }
    }
  }
}

type HttpServerOptions = {
  authToken?: string | undefined;
  originAllowlist?: string[] | undefined;
  statefulSessions?: boolean | undefined;
  sessionTtlMs?: number | undefined;
  maxSessions?: number | undefined;
  now?: (() => number) | undefined;
  profile?: RuntimeProfile | undefined;
  allowStdio?: boolean | undefined;
  rateLimiter?: InMemoryRateLimiter;
  monitorFactory?: () => MonitorServer;
};

type HttpStartupConfig = {
  authToken?: string | undefined;
  host: string;
  profile: RuntimeProfile;
  originAllowlist?: string[] | undefined;
};

export class InMemoryRateLimiter {
  private readonly buckets = new Map<string, { count: number; windowStartedAt: number }>();

  constructor(
    private readonly limit = 60,
    private readonly windowMs = 60_000,
    private readonly now: () => number = () => Date.now()
  ) {}

  public check(key: string): RateLimitResult {
    const currentTime = this.now();
    const bucket = this.buckets.get(key);

    if (!bucket || currentTime - bucket.windowStartedAt >= this.windowMs) {
      this.buckets.set(key, {
        count: 1,
        windowStartedAt: currentTime
      });

      return {
        allowed: true,
        remaining: this.limit - 1,
        resetAt: currentTime + this.windowMs
      };
    }

    bucket.count += 1;

    return {
      allowed: bucket.count <= this.limit,
      remaining: Math.max(0, this.limit - bucket.count),
      resetAt: bucket.windowStartedAt + this.windowMs
    };
  }
}

function jsonResponse(
  res: http.ServerResponse,
  statusCode: number,
  payload: unknown,
  headers: Record<string, string> = {}
): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    ...headers
  });
  res.end(JSON.stringify(payload));
}

function getRequestPath(req: http.IncomingMessage): string {
  const requestUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
  return requestUrl.pathname;
}

function isSchedulerEnabled(): boolean {
  return process.env.HEALTH_MONITOR_AUTO_CHECK === '1';
}

function getAuthTokenFromOptions(options: HttpServerOptions): string | undefined {
  return Object.hasOwn(options, 'authToken')
    ? options.authToken
    : process.env.HEALTH_MONITOR_HTTP_TOKEN?.trim();
}

function parseCsvEnv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function getOriginAllowlistFromOptions(options: HttpServerOptions): string[] {
  return Object.hasOwn(options, 'originAllowlist')
    ? (options.originAllowlist ?? [])
    : parseCsvEnv(process.env.HEALTH_MONITOR_HTTP_ORIGIN_ALLOWLIST);
}

function isStatefulSessionsEnabled(options: HttpServerOptions): boolean {
  return Object.hasOwn(options, 'statefulSessions')
    ? options.statefulSessions === true
    : process.env.HEALTH_MONITOR_HTTP_STATEFUL_SESSIONS === '1';
}

function getSessionTtlMs(options: HttpServerOptions): number {
  return Object.hasOwn(options, 'sessionTtlMs') && options.sessionTtlMs !== undefined
    ? Math.max(1_000, options.sessionTtlMs)
    : getBoundedIntegerEnv(
        'HEALTH_MONITOR_HTTP_SESSION_TTL_MS',
        DEFAULT_SESSION_TTL_MS,
        60_000,
        24 * 60 * 60 * 1000
      );
}

function getMaxSessions(options: HttpServerOptions): number {
  return Object.hasOwn(options, 'maxSessions') && options.maxSessions !== undefined
    ? Math.max(1, options.maxSessions)
    : getBoundedIntegerEnv('HEALTH_MONITOR_HTTP_MAX_SESSIONS', DEFAULT_MAX_SESSIONS, 1, 1_000);
}

function getHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? undefined : value;
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '[::1]' ||
    normalized.startsWith('127.')
  );
}

export function validateHttpStartupConfig(config: HttpStartupConfig): void {
  if (isLoopbackHost(config.host)) {
    return;
  }

  if (!config.authToken) {
    throw new Error('HEALTH_MONITOR_HTTP_TOKEN is required for non-loopback HTTP bind addresses');
  }

  if (!isRemoteSafeProfile(config.profile)) {
    throw new Error(
      'Non-loopback HTTP bind addresses require HEALTH_MONITOR_PROFILE=remote-safe, chatgpt, or claude'
    );
  }

  if (!config.originAllowlist?.length) {
    throw new Error(
      'HEALTH_MONITOR_HTTP_ORIGIN_ALLOWLIST is required for non-loopback HTTP bind addresses'
    );
  }
}

function isOriginAllowed(origin: string | string[] | undefined, allowlist: string[]): boolean {
  if (!origin || Array.isArray(origin) || allowlist.length === 0) {
    return true;
  }

  return allowlist.includes(origin);
}

function acceptsMcpResponse(accept: string | string[] | undefined): boolean {
  if (!accept || Array.isArray(accept)) {
    return true;
  }

  return accept
    .split(',')
    .map((entry) => entry.split(';')[0]?.trim().toLowerCase() ?? '')
    .some(
      (mediaType) =>
        mediaType === '*/*' ||
        mediaType === 'application/json' ||
        mediaType === 'text/event-stream' ||
        mediaType.endsWith('+json')
    );
}

function isValidBearerToken(authorization: string | undefined, authToken: string): boolean {
  const prefix = 'Bearer ';

  if (!authorization?.startsWith(prefix)) {
    return false;
  }

  const received = Buffer.from(authorization.slice(prefix.length), 'utf8');
  const expected = Buffer.from(authToken, 'utf8');

  return received.length === expected.length && timingSafeEqual(received, expected);
}

function isMainModule(): boolean {
  const currentFile = fileURLToPath(import.meta.url);
  const entryFile = process.argv[1] ? path.resolve(process.argv[1]) : '';
  return currentFile === entryFile;
}

async function readRequestBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalLength = 0;

  return new Promise((resolve, reject) => {
    req.on('data', (chunk: Buffer) => {
      totalLength += chunk.length;

      if (totalLength > MAX_REQUEST_BODY_BYTES) {
        reject(new Error('payload_too_large'));
        return;
      }

      chunks.push(chunk);
    });

    req.on('error', reject);

    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');

      if (body.length === 0) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('parse_error'));
      }
    });
  });
}

async function handleStatelessMcpRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  monitorFactory: () => MonitorServer
): Promise<void> {
  let parsedBody: unknown;

  try {
    parsedBody = await readRequestBody(req);
  } catch (error) {
    if (error instanceof Error && error.message === 'payload_too_large') {
      jsonResponse(res, 413, {
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Payload too large' },
        id: null
      });
      return;
    }

    jsonResponse(res, 400, {
      jsonrpc: '2.0',
      error: { code: -32700, message: 'Parse error' },
      id: null
    });
    return;
  }

  const server = monitorFactory();
  const transport = new StreamableHTTPServerTransport();

  res.on('close', () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport as unknown as Transport);
    await transport.handleRequest(req, res, parsedBody);
  } catch (error) {
    log('error', 'Failed to handle HTTP MCP request', {
      error: error instanceof Error ? error.message : String(error)
    });

    if (!res.headersSent) {
      jsonResponse(res, 500, {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal error'
        },
        id: null
      });
    }
  }
}

async function handleStatefulMcpRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  monitorFactory: () => MonitorServer,
  sessionRegistry: HttpSessionRegistry
): Promise<void> {
  let parsedBody: unknown;

  if (req.method === 'POST') {
    try {
      parsedBody = await readRequestBody(req);
    } catch (error) {
      if (error instanceof Error && error.message === 'payload_too_large') {
        jsonResponse(res, 413, { error: 'Payload too large' });
        return;
      }

      jsonResponse(res, 400, { error: 'Parse error' });
      return;
    }
  }

  const sessionId = getHeaderValue(req.headers['mcp-session-id']);

  if (sessionId) {
    const session = sessionRegistry.get(sessionId);

    if (!session) {
      jsonResponse(res, 404, { error: 'MCP session not found or expired' });
      return;
    }

    await session.transport.handleRequest(req, res, parsedBody);
    return;
  }

  if (req.method !== 'POST' || !isInitializeRequest(parsedBody)) {
    jsonResponse(res, 400, { error: 'MCP session ID is required for non-initialize requests' });
    return;
  }

  const session = sessionRegistry.create(monitorFactory);

  try {
    await session.server.connect(session.transport as unknown as Transport);
    await session.transport.handleRequest(req, res, parsedBody);
  } catch (error) {
    log('error', 'Failed to handle stateful HTTP MCP request', {
      error: error instanceof Error ? error.message : String(error)
    });

    await session.transport.close();
    await session.server.close();

    if (!res.headersSent) {
      jsonResponse(res, 500, { error: 'Internal error' });
    }
  }
}

export function createHttpServer(options: HttpServerOptions = {}): http.Server {
  const limiter = options.rateLimiter ?? new InMemoryRateLimiter();
  const authToken = getAuthTokenFromOptions(options);
  const originAllowlist = getOriginAllowlistFromOptions(options);
  const statefulSessions = isStatefulSessionsEnabled(options);
  const sessionRegistry = statefulSessions
    ? new HttpSessionRegistry({
        ttlMs: getSessionTtlMs(options),
        maxSessions: getMaxSessions(options),
        now: options.now
      })
    : null;
  const profile = options.profile ?? getRuntimeProfile();
  const policy = createRuntimePolicy({
    transport: 'http',
    profile,
    allowStdio: options.allowStdio
  });
  const monitorFactory =
    options.monitorFactory ??
    (() =>
      createMonitorServer({
        transport: 'http',
        profile,
        allowStdio: policy.allowStdio
      }));

  const server = http.createServer((req, res) => {
    const pathName = getRequestPath(req);

    if (req.method === 'GET' && pathName === '/health') {
      jsonResponse(res, 200, { status: 'ok', version: MONITOR_VERSION });
      return;
    }

    if (pathName !== '/mcp') {
      jsonResponse(res, 404, { error: 'Not Found' });
      return;
    }

    const allowedMethods = statefulSessions ? ['POST', 'GET', 'DELETE'] : ['POST'];

    if (!allowedMethods.includes(req.method ?? '')) {
      jsonResponse(res, 405, { error: 'Method Not Allowed' }, { Allow: allowedMethods.join(', ') });
      return;
    }

    if (!isOriginAllowed(req.headers.origin, originAllowlist)) {
      jsonResponse(res, 403, { error: 'Forbidden Origin' }, { Vary: 'Origin' });
      return;
    }

    if (!acceptsMcpResponse(req.headers.accept)) {
      jsonResponse(res, 406, { error: 'Not Acceptable' });
      return;
    }

    if (!authToken) {
      jsonResponse(res, 503, {
        error: 'HTTP MCP endpoint requires HEALTH_MONITOR_HTTP_TOKEN'
      });
      return;
    }

    if (!isValidBearerToken(req.headers.authorization, authToken)) {
      jsonResponse(res, 401, { error: 'Unauthorized' }, { 'WWW-Authenticate': 'Bearer' });
      return;
    }

    const clientIp = req.socket.remoteAddress ?? 'unknown';
    const rateLimit = limiter.check(clientIp);

    if (!rateLimit.allowed) {
      jsonResponse(
        res,
        429,
        { error: 'Too Many Requests' },
        {
          'Retry-After': Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000)).toString()
        }
      );
      return;
    }

    if (sessionRegistry) {
      void handleStatefulMcpRequest(req, res, monitorFactory, sessionRegistry);
      return;
    }

    void handleStatelessMcpRequest(req, res, monitorFactory);
  });

  server.on('close', () => {
    if (sessionRegistry) {
      void sessionRegistry.closeAll();
    }
  });

  return server;
}

export function startHttpServer(port = DEFAULT_PORT, host = DEFAULT_HOST): http.Server {
  const profile = getRuntimeProfile();
  const authToken = process.env.HEALTH_MONITOR_HTTP_TOKEN?.trim();
  const originAllowlist = parseCsvEnv(process.env.HEALTH_MONITOR_HTTP_ORIGIN_ALLOWLIST);
  const policy = createRuntimePolicy({ transport: 'http', profile });

  validateHttpStartupConfig({ host, authToken, profile, originAllowlist });

  if (isSchedulerEnabled()) {
    startScheduler(undefined, { allowStdio: policy.allowStdio });
  }

  const server = createHttpServer({
    authToken,
    profile,
    allowStdio: policy.allowStdio,
    originAllowlist,
    statefulSessions: process.env.HEALTH_MONITOR_HTTP_STATEFUL_SESSIONS === '1'
  });

  server.listen(port, host, () => {
    log('info', 'HTTP MCP server listening', { port, host, profile });
  });

  server.on('close', () => {
    stopScheduler();
  });

  server.on('error', (error) => {
    log('error', 'Failed to start HTTP MCP server', {
      port,
      host,
      error: error.message
    });
    process.exit(1);
  });

  return server;
}

if (isMainModule()) {
  startHttpServer();
}
