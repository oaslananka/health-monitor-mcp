import { jest } from '@jest/globals';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

import {
  checkHttpServer,
  checkServer,
  checkStdioServer,
  resetCheckerRuntimeForTests,
  setCheckerRuntimeForTests
} from '../../src/checker.js';

describe('checker', () => {
  beforeEach(() => {
    resetCheckerRuntimeForTests();
  });

  it('returns error for invalid server configuration', async () => {
    await expect(checkServer({ type: 'http' }, 1000)).resolves.toEqual(
      expect.objectContaining({
        status: 'error',
        error_message: expect.stringContaining('Invalid server configuration')
      })
    );
  });

  it('checks stdio server successfully', async () => {
    const client = {
      connect: jest.fn(async (_transport: unknown): Promise<void> => undefined),
      listTools: jest.fn(
        async (): Promise<{ tools: Array<{ name: string }> }> => ({
          tools: [{ name: 'alpha' }, { name: 'beta' }]
        })
      ),
      close: jest.fn(async (): Promise<void> => undefined)
    };

    const createStdioTransport = jest.fn(
      (options: unknown) => ({ kind: 'stdio', options }) as unknown as Transport
    );

    setCheckerRuntimeForTests({
      createClient: () => client,
      createStdioTransport
    });

    const result = await checkStdioServer('npx', ['demo-tool'], 1000);

    expect(result.status).toBe('up');
    expect(result.tool_count).toBe(2);
    expect(client.connect).toHaveBeenCalledWith(expect.objectContaining({ kind: 'stdio' }));
    expect(createStdioTransport).toHaveBeenCalledWith({
      command: 'npx',
      args: ['demo-tool'],
      stderr: 'pipe'
    });
    expect(client.close).toHaveBeenCalled();
  });

  it('rejects compound stdio commands before creating a transport', async () => {
    const client = {
      connect: jest.fn(async (_transport: unknown): Promise<void> => undefined),
      listTools: jest.fn(async (): Promise<{ tools: Array<{ name: string }> }> => ({ tools: [] })),
      close: jest.fn(async (): Promise<void> => undefined)
    };
    const createStdioTransport = jest.fn(
      (options: unknown) => ({ kind: 'stdio', options }) as unknown as Transport
    );

    setCheckerRuntimeForTests({
      createClient: () => client,
      createStdioTransport
    });

    const result = await checkStdioServer('npx mcp-debug-recorder', [], 1000);

    expect(result).toEqual(
      expect.objectContaining({
        status: 'error',
        error_message: expect.stringContaining('single executable path')
      })
    );
    expect(createStdioTransport).not.toHaveBeenCalled();
    expect(client.connect).not.toHaveBeenCalled();
  });

  it('returns timeout for stdio server that hangs', async () => {
    const client = {
      connect: jest.fn((_transport: unknown) => new Promise<void>(() => undefined)),
      listTools: jest.fn(
        async (): Promise<{ tools: Array<{ name: string }> }> => ({
          tools: []
        })
      ),
      close: jest.fn(async (): Promise<void> => undefined)
    };

    setCheckerRuntimeForTests({
      createClient: () => client,
      createStdioTransport: (options: unknown) =>
        ({ kind: 'stdio', options }) as unknown as Transport
    });

    const result = await checkStdioServer('npx', ['hung-tool'], 25);

    expect(result.status).toBe('timeout');
    expect(client.close).toHaveBeenCalled();
  });

  it('falls back from streamable http to sse', async () => {
    const client = {
      connect: jest.fn(async (transport: unknown): Promise<void> => {
        if ((transport as { kind: string }).kind === 'streamable') {
          throw new Error('streamable failed');
        }
      }),
      listTools: jest.fn(
        async (): Promise<{ tools: Array<{ name: string }> }> => ({
          tools: [{ name: 'health' }]
        })
      ),
      close: jest.fn(async (): Promise<void> => undefined)
    };
    const createStreamableTransport = jest.fn((url: URL) => ({ kind: 'streamable', url }));
    const createSseTransport = jest.fn((url: URL) => ({ kind: 'sse', url }));

    setCheckerRuntimeForTests({
      createClient: () => client,
      createStreamableTransport: createStreamableTransport as unknown as (url: URL) => Transport,
      createSseTransport: createSseTransport as unknown as (url: URL) => Transport,
      fetchImpl: jest.fn(async (_url: string | URL | Request) => {
        throw new Error('unused');
      }) as typeof fetch
    });

    const result = await checkHttpServer('https://example.com/mcp', 250);

    expect(result.status).toBe('up');
    expect(createStreamableTransport).toHaveBeenCalledTimes(2);
    expect(createSseTransport).toHaveBeenCalledTimes(1);
    expect(client.connect).toHaveBeenCalledTimes(3);
  });

  it('returns a down result and probes the endpoint when both http transports fail', async () => {
    const client = {
      connect: jest.fn(async (_transport: unknown): Promise<void> => {
        throw new Error('connect refused');
      }),
      listTools: jest.fn(
        async (): Promise<{ tools: Array<{ name: string }> }> => ({
          tools: []
        })
      ),
      close: jest.fn(async (): Promise<void> => undefined)
    };
    const fetchImpl = jest.fn(async (_url: string) => ({
      ok: true,
      status: 200,
      statusText: 'OK'
    }));

    setCheckerRuntimeForTests({
      createClient: () => client,
      createStreamableTransport: ((url: URL) =>
        ({ kind: 'streamable', url }) as unknown as Transport) as (url: URL) => Transport,
      createSseTransport: ((url: URL) => ({ kind: 'sse', url }) as unknown as Transport) as (
        url: URL
      ) => Transport,
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    const result = await checkHttpServer('https://example.com/mcp', 250);

    expect(result.status).toBe('down');
    expect(result.error_message).toContain('HTTP endpoint responded with 200 OK');
    expect(fetchImpl).toHaveBeenCalled();
  });

  it('returns timeout for HTTP checks when the initial transport never connects', async () => {
    const client = {
      connect: jest.fn((_transport: unknown) => new Promise<void>(() => undefined)),
      listTools: jest.fn(
        async (): Promise<{ tools: Array<{ name: string }> }> => ({
          tools: []
        })
      ),
      close: jest.fn(async (): Promise<void> => undefined)
    };

    setCheckerRuntimeForTests({
      createClient: () => client,
      createStreamableTransport: ((url: URL) =>
        ({ kind: 'streamable', url }) as unknown as Transport) as (url: URL) => Transport,
      createSseTransport: ((url: URL) => ({ kind: 'sse', url }) as unknown as Transport) as (
        url: URL
      ) => Transport,
      fetchImpl: jest.fn(async () => {
        throw new Error('unused');
      }) as unknown as typeof fetch
    });

    const result = await checkHttpServer('https://example.com/mcp', 25);

    expect(result.status).toBe('timeout');
    expect(result.error_message).toBe('timeout');
  });

  it('returns a down result without probe details when endpoint probing also fails', async () => {
    const client = {
      connect: jest.fn(async (_transport: unknown): Promise<void> => {
        throw new Error('connect refused');
      }),
      listTools: jest.fn(
        async (): Promise<{ tools: Array<{ name: string }> }> => ({
          tools: []
        })
      ),
      close: jest.fn(async (): Promise<void> => undefined)
    };

    setCheckerRuntimeForTests({
      createClient: () => client,
      createStreamableTransport: ((url: URL) =>
        ({ kind: 'streamable', url }) as unknown as Transport) as (url: URL) => Transport,
      createSseTransport: ((url: URL) => ({ kind: 'sse', url }) as unknown as Transport) as (
        url: URL
      ) => Transport,
      fetchImpl: jest.fn(async () => {
        throw new Error('probe failed');
      }) as unknown as typeof fetch
    });

    const result = await checkHttpServer('https://example.com/mcp', 250);

    expect(result.status).toBe('down');
    expect(result.error_message).toContain('connect refused');
    expect(result.error_message).not.toContain('HTTP endpoint responded');
  });

  it('passes an AbortSignal to HTTP endpoint probes', async () => {
    const client = {
      connect: jest.fn(async (_transport: unknown): Promise<void> => {
        throw new Error('connect refused');
      }),
      listTools: jest.fn(
        async (): Promise<{ tools: Array<{ name: string }> }> => ({
          tools: []
        })
      ),
      close: jest.fn(async (): Promise<void> => undefined)
    };
    const fetchImpl = jest.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.signal).toBeDefined();
      throw new Error('probe failed');
    });

    setCheckerRuntimeForTests({
      createClient: () => client,
      createStreamableTransport: ((url: URL) =>
        ({ kind: 'streamable', url }) as unknown as Transport) as (url: URL) => Transport,
      createSseTransport: ((url: URL) => ({ kind: 'sse', url }) as unknown as Transport) as (
        url: URL
      ) => Transport,
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    await checkHttpServer('https://example.com/mcp', 250);

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.com/mcp',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('returns stdio disabled error when policy disallows stdio checks', async () => {
    await expect(
      checkServer({ type: 'stdio', command: 'node', args: ['server.js'] }, 1_000, {
        allowStdio: false
      })
    ).resolves.toEqual(
      expect.objectContaining({
        status: 'error',
        error_message: expect.stringContaining('stdio transport is disabled')
      })
    );
  });

  it('classifies stdio tool listing timeouts as timeout results', async () => {
    const client = {
      connect: jest.fn(async (_transport: unknown): Promise<void> => undefined),
      listTools: jest.fn(() => new Promise<{ tools: Array<{ name: string }> }>(() => undefined)),
      close: jest.fn(async (): Promise<void> => undefined)
    };

    setCheckerRuntimeForTests({
      createClient: () => client,
      createStdioTransport: (options: unknown) =>
        ({ kind: 'stdio', options }) as unknown as Transport
    });

    const result = await checkStdioServer('node', ['server.js'], 25);

    expect(result.status).toBe('timeout');
    expect(result.error_message).toBe('timeout');
    expect(client.close).toHaveBeenCalled();
  });
});
