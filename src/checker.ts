import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import {
  type StdioServerParameters,
  StdioClientTransport
} from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

import { getHttpTimeoutMs } from './config.js';
import { fetchWithTimeout } from './network.js';
import { withRetry } from './retry.js';
import { MONITOR_NAME, MONITOR_VERSION } from './version.js';
import type { CheckResult, RegisteredServer } from './types.js';

type ClientLike = {
  connect: (transport: Transport) => Promise<void>;
  listTools: () => Promise<{ tools: Array<{ name: string }> }>;
  close: () => Promise<void>;
};

type ProbeResponse = {
  ok: boolean;
  status: number;
  statusText: string;
};

interface CheckerRuntime {
  createClient: () => ClientLike;
  createStreamableTransport: (url: URL) => Transport;
  createSseTransport: (url: URL) => Transport;
  createStdioTransport: (options: StdioServerParameters) => Transport;
  fetchImpl: typeof globalThis.fetch;
}

const createDefaultRuntime = (): CheckerRuntime => ({
  createClient: () =>
    new Client({
      name: MONITOR_NAME,
      version: MONITOR_VERSION
    }),
  createStreamableTransport: (url) =>
    new StreamableHTTPClientTransport(url) as unknown as Transport,
  createSseTransport: (url) => new SSEClientTransport(url) as unknown as Transport,
  createStdioTransport: (options) => new StdioClientTransport(options) as unknown as Transport,
  fetchImpl: globalThis.fetch.bind(globalThis)
});

let checkerRuntime: CheckerRuntime = createDefaultRuntime();

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.message === 'timeout';
}

async function closeQuietly(client: ClientLike): Promise<void> {
  try {
    await client.close();
  } catch {
    // Ignore cleanup failures.
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (timeoutMs <= 0) {
    return Promise.reject(new Error('timeout'));
  }

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function getRemainingTimeout(startedAt: number, timeoutMs: number): number {
  return timeoutMs - (Date.now() - startedAt);
}

function splitCommand(command: string): { command: string; args: string[] } {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;

  for (const character of command.trim()) {
    if ((character === '"' || character === "'") && quote === null) {
      quote = character;
      continue;
    }

    if (quote !== null && character === quote) {
      quote = null;
      continue;
    }

    if (character === ' ' && quote === null) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += character;
  }

  if (current) {
    tokens.push(current);
  }

  return {
    command: tokens[0] ?? command,
    args: tokens.slice(1)
  };
}

async function attemptTransport(
  createTransport: () => Transport,
  timeoutMs: number,
  startedAt: number
): Promise<CheckResult> {
  const client = checkerRuntime.createClient();

  try {
    const connectTimeout = getRemainingTimeout(startedAt, timeoutMs);
    if (connectTimeout <= 0) {
      throw new Error('timeout');
    }

    await withTimeout(client.connect(createTransport()), connectTimeout);
    const listToolsTimeout = getRemainingTimeout(startedAt, timeoutMs);
    if (listToolsTimeout <= 0) {
      throw new Error('timeout');
    }

    const toolsResult = await withTimeout(client.listTools(), listToolsTimeout);
    const tools = toolsResult.tools.map((tool) => tool.name);
    const responseTime = Date.now() - startedAt;
    await closeQuietly(client);

    return {
      status: 'up',
      response_time_ms: responseTime,
      tool_count: tools.length,
      error_message: null,
      tools
    };
  } catch (error) {
    await closeQuietly(client);
    throw error;
  }
}

async function attemptTransportWithRetry(
  createTransport: () => Transport,
  timeoutMs: number,
  startedAt: number
): Promise<CheckResult> {
  return withRetry(() => attemptTransport(createTransport, timeoutMs, startedAt), {
    attempts: 2,
    shouldRetry: (error) => !isTimeoutError(error)
  });
}

async function probeHttpEndpoint(url: string, timeoutMs: number): Promise<string | null> {
  try {
    const response = await fetchWithTimeout(
      checkerRuntime.fetchImpl,
      url,
      { method: 'GET' },
      Math.max(1_000, Math.min(timeoutMs, getHttpTimeoutMs(timeoutMs))),
      'HTTP probe timed out'
    );
    const probeResponse: ProbeResponse = {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText
    };

    return `HTTP endpoint responded with ${probeResponse.status} ${probeResponse.statusText} but did not complete an MCP handshake`;
  } catch {
    return null;
  }
}

export async function checkHttpServer(url: string, timeoutMs: number): Promise<CheckResult> {
  const startedAt = Date.now();

  try {
    return await attemptTransportWithRetry(
      () => checkerRuntime.createStreamableTransport(new URL(url)),
      timeoutMs,
      startedAt
    );
  } catch (streamableError) {
    if (isTimeoutError(streamableError)) {
      return {
        status: 'timeout',
        response_time_ms: Date.now() - startedAt,
        tool_count: null,
        error_message: 'timeout',
        tools: null
      };
    }

    try {
      return await attemptTransport(
        () => checkerRuntime.createSseTransport(new URL(url)),
        timeoutMs,
        startedAt
      );
    } catch (sseError) {
      const detail = await probeHttpEndpoint(
        url,
        Math.max(1_000, getRemainingTimeout(startedAt, timeoutMs))
      );
      const messages = [streamableError, sseError]
        .filter((value): value is Error => value instanceof Error)
        .map((value) => value.message);

      return {
        status: isTimeoutError(sseError) ? 'timeout' : 'down',
        response_time_ms: Date.now() - startedAt,
        tool_count: null,
        error_message: `${messages.join(' | ') || 'Unknown error'}${detail ? `; ${detail}` : ''}`,
        tools: null
      };
    }
  }
}

export async function checkStdioServer(
  command: string,
  args: string[],
  timeoutMs: number
): Promise<CheckResult> {
  const startedAt = Date.now();
  const client = checkerRuntime.createClient();
  const parsed = splitCommand(command);

  try {
    const transport = checkerRuntime.createStdioTransport({
      command: parsed.command,
      args: [...parsed.args, ...args],
      stderr: 'pipe'
    });

    await withTimeout(client.connect(transport), timeoutMs);
    const toolsResult = await withTimeout(
      client.listTools(),
      getRemainingTimeout(startedAt, timeoutMs)
    );
    const tools = toolsResult.tools.map((tool) => tool.name);
    await closeQuietly(client);

    return {
      status: 'up',
      response_time_ms: Date.now() - startedAt,
      tool_count: tools.length,
      error_message: null,
      tools
    };
  } catch (error) {
    await closeQuietly(client);
    return {
      status: isTimeoutError(error) ? 'timeout' : 'error',
      response_time_ms: Date.now() - startedAt,
      tool_count: null,
      error_message: error instanceof Error ? error.message : 'Unknown error',
      tools: null
    };
  }
}

export async function checkServer(
  server: Pick<RegisteredServer, 'type'> & {
    url?: string | null;
    command?: string | null;
    args?: string[];
  },
  timeoutMs: number,
  options: { allowStdio?: boolean | undefined } = {}
): Promise<CheckResult> {
  if ((server.type === 'http' || server.type === 'sse') && server.url) {
    return checkHttpServer(server.url, timeoutMs);
  }

  if (server.type === 'stdio' && server.command) {
    if (options.allowStdio === false) {
      return {
        status: 'error',
        response_time_ms: null,
        tool_count: null,
        error_message: 'stdio transport is disabled for this runtime profile',
        tools: null
      };
    }

    return checkStdioServer(server.command, server.args ?? [], timeoutMs);
  }

  return {
    status: 'error',
    response_time_ms: null,
    tool_count: null,
    error_message: 'Invalid server configuration - missing url or command',
    tools: null
  };
}

/** @internal */
export function setCheckerRuntimeForTests(overrides: Partial<CheckerRuntime>): void {
  checkerRuntime = {
    ...checkerRuntime,
    ...overrides
  };
}

/** @internal */
export function resetCheckerRuntimeForTests(): void {
  checkerRuntime = createDefaultRuntime();
}
