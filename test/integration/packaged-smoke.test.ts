import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

import { MONITOR_VERSION } from '../../src/version.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function run(command: string, args: string[], options: { cwd?: string } = {}): string {
  return execFileSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === 'object' && address) {
          resolve(address.port);
          return;
        }

        reject(new Error('Failed to allocate a local test port'));
      });
    });
  });
}

async function waitForHealth(port: number): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 150; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);

      if (response.ok) {
        return response;
      }

      lastError = new Error(`Unexpected health status ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await delay(100);
  }

  throw lastError instanceof Error ? lastError : new Error('Timed out waiting for HTTP server');
}

async function waitForOutput(readOutput: () => string, expected: string): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    if (readOutput().includes(expected)) {
      return;
    }

    await delay(20);
  }

  throw new Error(`Timed out waiting for process output: ${expected}`);
}

function stopProcess(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.killed) {
      resolve();
      return;
    }

    child.once('exit', () => resolve());
    child.kill('SIGTERM');

    setTimeout(() => {
      if (child.exitCode === null && !child.killed) {
        child.kill('SIGKILL');
      }
    }, 2_000).unref();
  });
}

describe('packaged MCP smoke tests', () => {
  let packDir: string;

  beforeAll(() => {
    run('pnpm', ['run', 'build']);
    packDir = fs.mkdtempSync(path.join(os.tmpdir(), 'health-monitor-mcp-pack-'));
  }, 60_000);

  afterAll(() => {
    if (packDir) {
      fs.rmSync(packDir, { recursive: true, force: true });
    }
  });

  it('packs the publish artifact with executable stdio and HTTP entrypoints', () => {
    const output = run('pnpm', ['pack', '--json', '--pack-destination', packDir]);
    const lines = output.trim().split('\n');
    const jsonStr = lines.filter((line) => !line.startsWith('[WARN]')).join('\n');
    const packResult = JSON.parse(jsonStr) as { filename: string } | Array<{ filename: string }>;
    const filename = Array.isArray(packResult) ? packResult[0]?.filename : packResult.filename;

    if (!filename) {
      throw new Error('pnpm pack did not report a filename');
    }

    const tarball = path.isAbsolute(filename) ? filename : path.join(packDir, filename);

    expect(fs.existsSync(tarball)).toBe(true);

    const entries = run('tar', ['-tf', tarball]).split('\n');
    expect(entries).toContain('package/dist/mcp.js');
    expect(entries).toContain('package/dist/server-http.js');
    expect(entries).toContain('package/dist/mcp.d.ts');
    expect(entries).toContain('package/mcp.json');
    expect(entries).toContain('package/server.json');

    const mcpMetadata = JSON.parse(fs.readFileSync(path.join(repoRoot, 'mcp.json'), 'utf8')) as {
      tools: string[];
      env: Record<string, unknown>;
      description: string;
    };
    const serverMetadata = fs.readFileSync(path.join(repoRoot, 'server.json'), 'utf8');
    expect(mcpMetadata.tools).toEqual([
      'register_server',
      'check_server',
      'check_all',
      'get_uptime',
      'get_dashboard',
      'get_report',
      'list_servers',
      'unregister_server',
      'set_alert',
      'get_monitor_stats'
    ]);
    expect(JSON.stringify(mcpMetadata)).not.toMatch(/azure|pat_token|pipeline/i);
    expect(serverMetadata).not.toMatch(/azure|pat_token|pipeline/i);

    const shebang = fs.readFileSync(path.join(repoRoot, 'dist', 'mcp.js'), 'utf8').split('\n')[0];
    expect(shebang).toBe('#!/usr/bin/env node');
  }, 60_000);

  it('runs the packaged stdio entrypoint version command', () => {
    const output = run('node', ['dist/mcp.js', '--version']).trim();

    expect(output).toBe(MONITOR_VERSION);
  });

  it('keeps scheduler runtime logs off stdout in packaged stdio mode', async () => {
    const child = spawn(process.execPath, ['dist/mcp.js'], {
      cwd: repoRoot,
      env: {
        ...process.env,
        HEALTH_MONITOR_AUTO_CHECK: '1',
        HEALTH_MONITOR_DB: ':memory:'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk;
    });

    try {
      await waitForOutput(
        () => `${stdout}
${stderr}`,
        '"message":"Scheduler started"'
      );

      expect(stderr).toContain('"message":"Scheduler started"');
      expect(stdout).toBe('');
    } finally {
      await stopProcess(child);
    }
  }, 30_000);

  it('starts the packaged HTTP entrypoint and serves health checks', async () => {
    const port = await getFreePort();
    const child = spawn(process.execPath, ['dist/server-http.js'], {
      cwd: repoRoot,
      env: {
        ...process.env,
        HOST: '127.0.0.1',
        PORT: String(port),
        HEALTH_MONITOR_HTTP_TOKEN: 'packaged-smoke-token',
        HEALTH_MONITOR_DB: ':memory:'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    try {
      const response = await waitForHealth(port);
      const payload = (await response.json()) as { status: string; version: string };

      expect(payload).toEqual({
        status: 'ok',
        version: MONITOR_VERSION
      });
    } finally {
      await stopProcess(child);
    }
  }, 30_000);
});
