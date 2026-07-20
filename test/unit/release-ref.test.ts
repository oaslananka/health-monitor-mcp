import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PROJECT_ROOT } from '../fixtures/project.js';

const VERIFY_SCRIPT = join(PROJECT_ROOT, 'scripts', 'verify-release-ref.mjs');
const tempRoots: string[] = [];

function runGit(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function writeJson(cwd: string, name: string, value: unknown): void {
  writeFileSync(join(cwd, name), `${JSON.stringify(value, null, 2)}\n`);
}

function createReleaseRepository(options: { tag?: boolean; version?: string } = {}): {
  cwd: string;
  tagName: string;
  commit: string;
} {
  const version = options.version ?? '1.1.0';
  const cwd = mkdtempSync(join(tmpdir(), 'health-monitor-release-ref-'));
  tempRoots.push(cwd);

  writeJson(cwd, 'package.json', {
    name: 'health-monitor-mcp',
    version,
    mcpName: 'io.github.oaslananka/health-monitor-mcp'
  });
  writeJson(cwd, 'mcp.json', {
    version,
    mcpName: 'io.github.oaslananka/health-monitor-mcp'
  });
  writeJson(cwd, 'server.json', {
    name: 'io.github.oaslananka/health-monitor-mcp',
    version,
    packages: [{ registryType: 'npm', identifier: 'health-monitor-mcp', version }]
  });
  writeJson(cwd, '.release-please-manifest.json', { '.': version });

  runGit(cwd, ['init', '--initial-branch=main']);
  runGit(cwd, ['config', 'user.name', 'Release Test']);
  runGit(cwd, ['config', 'user.email', 'release-test@example.invalid']);
  runGit(cwd, ['add', '.']);
  runGit(cwd, ['commit', '-m', 'chore: release fixture']);

  const tagName = `health-monitor-mcp-v${version}`;

  if (options.tag !== false) {
    runGit(cwd, ['tag', tagName]);
  }

  return { cwd, tagName, commit: runGit(cwd, ['rev-parse', 'HEAD']) };
}

function runVerifier(cwd: string, tagName: string) {
  return spawnSync(process.execPath, [VERIFY_SCRIPT, '--tag', tagName], {
    cwd,
    encoding: 'utf8'
  });
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('release ref verification', () => {
  it('accepts synchronized metadata when the component tag points at HEAD', () => {
    const fixture = createReleaseRepository();

    const result = runVerifier(fixture.cwd, fixture.tagName);

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      package: 'health-monitor-mcp',
      version: '1.1.0',
      tag_name: fixture.tagName,
      commit: fixture.commit
    });
  });

  it('rejects a tag name that does not match package metadata', () => {
    const fixture = createReleaseRepository();

    const result = runVerifier(fixture.cwd, 'v1.1.0');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('expected release tag health-monitor-mcp-v1.1.0');
  });

  it('rejects unsynchronized release metadata', () => {
    const fixture = createReleaseRepository();
    writeJson(fixture.cwd, 'mcp.json', {
      version: '1.0.0',
      mcpName: 'io.github.oaslananka/health-monitor-mcp'
    });

    const result = runVerifier(fixture.cwd, fixture.tagName);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('release metadata versions are not synchronized');
  });

  it('rejects a missing release tag', () => {
    const fixture = createReleaseRepository({ tag: false });

    const result = runVerifier(fixture.cwd, fixture.tagName);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`release tag ${fixture.tagName} does not exist`);
  });

  it('rejects a release tag that does not point at HEAD', () => {
    const fixture = createReleaseRepository();
    writeFileSync(join(fixture.cwd, 'post-tag.txt'), 'new commit\n');
    runGit(fixture.cwd, ['add', 'post-tag.txt']);
    runGit(fixture.cwd, ['commit', '-m', 'fix: post-tag change']);

    const result = runVerifier(fixture.cwd, fixture.tagName);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`release tag ${fixture.tagName} does not point at HEAD`);
  });
});
