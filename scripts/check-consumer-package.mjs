import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PACKAGE_NAME = 'health-monitor-mcp';
const PATCHED_NODE_SERVER_FLOOR = '2.0.5';

function commandName(name) {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

function run(command, args, cwd, { allowFailure = false } = {}) {
  const result = spawnSync(commandName(command), args, {
    cwd,
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed: ${result.stderr || result.stdout || `exit ${result.status}`}`
    );
  }

  return result;
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} did not return valid JSON: ${error.message}`);
  }
}

function versionAtLeast(actual, minimum) {
  const actualParts = actual.split('.').map(Number);
  const minimumParts = minimum.split('.').map(Number);

  for (let index = 0; index < 3; index += 1) {
    const actualPart = actualParts[index] ?? 0;
    const minimumPart = minimumParts[index] ?? 0;
    if (actualPart > minimumPart) return true;
    if (actualPart < minimumPart) return false;
  }

  return true;
}

const packageJson = parseJson(fs.readFileSync('package.json', 'utf8'), 'package.json');
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'health-monitor-consumer-check-'));
const packDirectory = path.join(temporaryDirectory, 'pack');
const consumerDirectory = path.join(temporaryDirectory, 'consumer');

try {
  fs.mkdirSync(packDirectory, { recursive: true });
  fs.mkdirSync(consumerDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(consumerDirectory, 'package.json'),
    `${JSON.stringify({ name: 'health-monitor-consumer-check', version: '1.0.0', private: true }, null, 2)}\n`
  );

  const packResult = run(
    'pnpm',
    ['pack', '--json', '--pack-destination', packDirectory],
    process.cwd()
  );
  const packMetadata = parseJson(packResult.stdout, 'pnpm pack');
  const packEntry = Array.isArray(packMetadata) ? packMetadata[0] : packMetadata;
  if (!packEntry?.filename) throw new Error('pnpm pack did not report a package filename');

  const tarballPath = path.join(packDirectory, path.basename(packEntry.filename));
  run(
    'npm',
    ['install', tarballPath, '--ignore-scripts', '--no-fund', '--no-audit'],
    consumerDirectory
  );

  const installedRoot = path.join(consumerDirectory, 'node_modules', PACKAGE_NAME);
  const sdkManifest = parseJson(
    fs.readFileSync(
      path.join(installedRoot, 'node_modules', '@modelcontextprotocol', 'sdk', 'package.json'),
      'utf8'
    ),
    'bundled MCP SDK manifest'
  );
  const nodeServerManifest = parseJson(
    fs.readFileSync(
      path.join(installedRoot, 'node_modules', '@hono', 'node-server', 'package.json'),
      'utf8'
    ),
    'bundled Hono Node server manifest'
  );

  if (sdkManifest.dependencies?.['@hono/node-server'] !== '^2.0.5') {
    throw new Error(
      `bundled MCP SDK declares unexpected @hono/node-server range ${sdkManifest.dependencies?.['@hono/node-server']}`
    );
  }
  if (!versionAtLeast(nodeServerManifest.version, PATCHED_NODE_SERVER_FLOOR)) {
    throw new Error(
      `bundled @hono/node-server ${nodeServerManifest.version} is below ${PATCHED_NODE_SERVER_FLOOR}`
    );
  }

  run(
    'npm',
    ['ls', PACKAGE_NAME, '@modelcontextprotocol/sdk', '@hono/node-server', '--all'],
    consumerDirectory
  );

  const versionResult = run(
    process.execPath,
    [path.join(installedRoot, 'dist', 'mcp.js'), '--version'],
    consumerDirectory
  );
  if (versionResult.stdout.trim() !== packageJson.version) {
    throw new Error(
      `consumer CLI reported ${versionResult.stdout.trim()} instead of ${packageJson.version}`
    );
  }

  const auditResult = run('npm', ['audit', '--json', '--audit-level=low'], consumerDirectory, {
    allowFailure: true
  });
  const audit = parseJson(auditResult.stdout, 'npm audit');
  const vulnerabilities = audit.metadata?.vulnerabilities;
  const totalVulnerabilities = vulnerabilities?.total ?? 0;
  if (auditResult.status !== 0 || totalVulnerabilities !== 0) {
    throw new Error(`consumer npm audit reported ${totalVulnerabilities} vulnerabilities`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        package: `${packageJson.name}@${packageJson.version}`,
        bundledSdk: sdkManifest.version,
        bundledNodeServer: nodeServerManifest.version,
        vulnerabilities: totalVulnerabilities,
        tarballBytes: fs.statSync(tarballPath).size
      },
      null,
      2
    )
  );
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
