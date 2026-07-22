import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function writeJson(directory: string, filename: string, value: unknown): void {
  fs.writeFileSync(path.join(directory, filename), `${JSON.stringify(value, null, 2)}\n`);
}

function runValidator(directory: string): ReturnType<typeof spawnSync> {
  return spawnSync(
    process.execPath,
    [path.join(repoRoot, 'scripts', 'validate-mcp-metadata.mjs')],
    {
      cwd: directory,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );
}

function fixture(directory: string, description: string): void {
  writeJson(directory, 'package.json', {
    name: 'health-monitor-mcp',
    version: '1.2.0',
    mcpName: 'io.github.oaslananka/health-monitor-mcp'
  });
  writeJson(directory, 'mcp.json', {
    version: '1.2.0',
    mcpName: 'io.github.oaslananka/health-monitor-mcp',
    description
  });
  writeJson(directory, 'server.json', {
    $schema: 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
    name: 'io.github.oaslananka/health-monitor-mcp',
    version: '1.2.0',
    description,
    packages: [
      {
        registryType: 'npm',
        identifier: 'health-monitor-mcp',
        version: '1.2.0',
        transport: { type: 'stdio' }
      }
    ]
  });
  writeJson(directory, '.release-please-manifest.json', { '.': '1.2.0' });
  fs.mkdirSync(path.join(directory, '.claude-plugin'), { recursive: true });
  writeJson(directory, '.claude-plugin/plugin.json', {
    name: 'health-monitor-mcp',
    version: '1.2.0'
  });
}

describe('MCP metadata validator', () => {
  let directory: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'health-monitor-metadata-'));
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('accepts public descriptions at the 100-character boundary', () => {
    fixture(directory, 'a'.repeat(100));

    const result = runValidator(directory);

    expect(result.status).toBe(0);
  });

  it('rejects MCP and server descriptions longer than 100 characters', () => {
    fixture(directory, 'a'.repeat(101));

    const result = runValidator(directory);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('mcp.json description must be at most 100 characters');
    expect(result.stderr).toContain('server.json description must be at most 100 characters');
  });
});
