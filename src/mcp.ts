#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

import { createMonitorServer } from './app.js';
import { startScheduler, stopScheduler } from './scheduler.js';
import { MONITOR_VERSION } from './version.js';

function shouldEnableScheduler(): boolean {
  return process.env.HEALTH_MONITOR_AUTO_CHECK === '1';
}

async function closeQuietly(transport: StdioServerTransport): Promise<void> {
  try {
    await transport.close();
  } catch {
    // Ignore shutdown failures during process exit.
  }
}

export async function startStdioServer(): Promise<void> {
  if (process.argv.includes('--version')) {
    console.log(MONITOR_VERSION);
    return;
  }

  if (shouldEnableScheduler()) {
    startScheduler();
  }

  const server = createMonitorServer();
  const transport = new StdioServerTransport();

  const shutdown = async (): Promise<void> => {
    stopScheduler();
    await closeQuietly(transport);
    await server.close();
  };

  process.once('SIGINT', () => {
    void shutdown().finally(() => process.exit(0));
  });
  process.once('SIGTERM', () => {
    void shutdown().finally(() => process.exit(0));
  });

  await server.connect(transport as unknown as Transport);
}

await startStdioServer();
