import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function resolveCommand(command) {
  if (process.platform === 'win32' && command === 'npm') {
    return 'npm.cmd';
  }

  return command;
}

function run(command, args) {
  const result = spawnSync(resolveCommand(command), args, { encoding: 'utf8' });

  return {
    status: result.status ?? 1,
    stdout: result.stdout?.trim() ?? '',
    stderr: result.stderr?.trim() ?? result.error?.message ?? ''
  };
}

function npmVersionExists(name, version) {
  const result = run('npm', ['view', `${name}@${version}`, 'version', '--json']);

  if (result.status !== 0) {
    return false;
  }

  try {
    return JSON.parse(result.stdout) === version;
  } catch {
    return result.stdout.replace(/^"|"$/g, '') === version;
  }
}

function resolveReleaseTag(packageName, version) {
  const candidates = [`${packageName}-v${version}`, `v${version}`];
  const existing = candidates.find((candidate) => tagExists(candidate));

  return {
    tagName: existing ?? candidates[0],
    tagCandidates: candidates,
    tagExists: Boolean(existing)
  };
}

function tagExists(tagName) {
  return run('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${tagName}`]).status === 0;
}

const packageJson = readJson('package.json');
const mcpJson = readJson('mcp.json');
const serverJson = readJson('server.json');
const requireTag = process.argv.includes('--require-tag');
const releaseManifest = fs.existsSync('.release-please-manifest.json')
  ? readJson('.release-please-manifest.json')
  : {};
const releaseTag = resolveReleaseTag(packageJson.name, packageJson.version);
const blockers = [];
const states = [];

if (packageJson.version !== mcpJson.version || packageJson.version !== serverJson.version) {
  blockers.push('package, mcp.json, and server.json versions are not synchronized');
}

if (releaseManifest['.'] !== packageJson.version) {
  blockers.push('release-please manifest is not synchronized with package version');
}

if (packageJson.mcpName !== serverJson.name || packageJson.mcpName !== mcpJson.mcpName) {
  blockers.push('MCP identity metadata is not synchronized');
}

if (releaseTag.tagExists) {
  states.push('tag-created');
}

const gitStatus = run('git', ['status', '--porcelain', '--untracked-files=no']);
const npmExists = npmVersionExists(packageJson.name, packageJson.version);

if (requireTag && !releaseTag.tagExists) {
  blockers.push(`release tag ${releaseTag.tagName} does not exist`);
}

if (gitStatus.stdout.length > 0) {
  blockers.push('tracked working tree has uncommitted changes');
  states.push('dirty');
}

if (npmExists) {
  blockers.push(`npm package ${packageJson.name}@${packageJson.version} already exists`);
  states.push('npm-published');
}

if (!states.length) {
  states.push('no-release');
}

if (blockers.length) {
  states.push('blocked');
}

const result = {
  package: packageJson.name,
  version: packageJson.version,
  tag_name: releaseTag.tagName,
  tag_candidates: releaseTag.tagCandidates,
  states,
  safe_to_publish: blockers.length === 0,
  blockers,
  next_safe_command: blockers.length
    ? 'Resolve blockers before publishing.'
    : 'Open or merge the release-please release pull request; do not publish from a local machine.',
  surfaces: {
    npm: true,
    mcp_registry: true,
    docker_ghcr: false,
    github_release: true
  }
};

console.log(JSON.stringify(result, null, 2));
