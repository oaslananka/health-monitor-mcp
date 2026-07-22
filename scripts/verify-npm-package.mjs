import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  assertPackageContentsEqual,
  integrityForBuffer,
  packageFileIndex
} from './package-tarball.mjs';

const DEFAULT_ATTEMPTS = 6;
const DEFAULT_RETRY_DELAY_MS = 10000;
const NPM_REGISTRY_URL = 'https://registry.npmjs.org';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function resolveCommand(command) {
  if (process.platform === 'win32' && ['npm', 'pnpm'].includes(command)) {
    return `${command}.cmd`;
  }

  return command;
}

function run(command, args) {
  const result =
    process.platform === 'win32'
      ? spawnSync('cmd.exe', ['/d', '/s', '/c', resolveCommand(command), ...args], {
          encoding: 'utf8'
        })
      : spawnSync(resolveCommand(command), args, { encoding: 'utf8' });

  return {
    status: result.status ?? 1,
    stdout: result.stdout?.trim() ?? '',
    stderr: result.stderr?.trim() ?? result.error?.message ?? ''
  };
}

function parseJson(output, label) {
  try {
    return JSON.parse(output);
  } catch (error) {
    throw new Error(`${label} did not return valid JSON: ${error.message}`);
  }
}

function positiveIntegerFromEnv(name, fallback) {
  const raw = process.env[name];
  const parsed = Number.parseInt(raw ?? '', 10);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function localPackageTarball(directory) {
  const suppliedTarball = process.env.LOCAL_PACKAGE_TARBALL;
  if (suppliedTarball) {
    const tarballPath = path.resolve(suppliedTarball);
    if (!fs.existsSync(tarballPath)) {
      throw new Error(`LOCAL_PACKAGE_TARBALL does not exist: ${tarballPath}`);
    }

    return fs.readFileSync(tarballPath);
  }

  const result = run('pnpm', ['pack', '--json', '--pack-destination', directory]);

  if (result.status !== 0) {
    throw new Error(`pnpm pack failed: ${result.stderr || result.stdout}`);
  }

  const metadata = parseJson(result.stdout, 'pnpm pack');
  const entry = Array.isArray(metadata) ? metadata[0] : metadata;

  if (!entry?.filename) {
    throw new Error('pnpm pack did not report a package filename');
  }

  const tarballPath = path.isAbsolute(entry.filename)
    ? entry.filename
    : path.join(directory, path.basename(entry.filename));
  if (!fs.existsSync(tarballPath)) {
    throw new Error(`pnpm pack did not create ${tarballPath}`);
  }

  return fs.readFileSync(tarballPath);
}

function registryPackageMetadata(packageName, version) {
  const result = run('npm', [
    'view',
    `${packageName}@${version}`,
    'version',
    'dist.integrity',
    'dist.tarball',
    '--registry',
    NPM_REGISTRY_URL,
    '--json'
  ]);

  if (result.status !== 0) {
    throw new Error(
      result.stderr || result.stdout || `npm view failed for ${packageName}@${version}`
    );
  }

  return parseJson(result.stdout, 'npm view');
}

function validateRegistryMetadata(packageJson, registryMetadata) {
  if (registryMetadata.version !== packageJson.version) {
    throw new Error(
      `registry version ${registryMetadata.version} does not match package ${packageJson.version}`
    );
  }

  if (typeof registryMetadata['dist.integrity'] !== 'string') {
    throw new Error('registry metadata is missing dist.integrity');
  }

  if (typeof registryMetadata['dist.tarball'] !== 'string') {
    throw new Error('registry metadata is missing dist.tarball');
  }

  const tarballUrl = new URL(registryMetadata['dist.tarball']);
  if (tarballUrl.protocol !== 'https:' || tarballUrl.hostname !== 'registry.npmjs.org') {
    throw new Error(`registry tarball URL is not trusted: ${tarballUrl.href}`);
  }
}

async function withRetry(operation, label) {
  const attempts = positiveIntegerFromEnv('NPM_VERIFY_ATTEMPTS', DEFAULT_ATTEMPTS);
  const retryDelayMs = positiveIntegerFromEnv('NPM_VERIFY_DELAY_MS', DEFAULT_RETRY_DELAY_MS);
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt < attempts) {
        await sleep(retryDelayMs);
      }
    }
  }

  throw new Error(`${label} failed after ${attempts} attempts: ${lastError?.message ?? lastError}`);
}

async function fetchRegistryTarball(url) {
  const response = await fetch(url, {
    headers: { accept: 'application/octet-stream' },
    redirect: 'error'
  });

  if (!response.ok) {
    throw new Error(`registry tarball request returned HTTP ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

const packageJson = readJson('package.json');
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'health-monitor-npm-verify-'));

try {
  const localTarball = localPackageTarball(temporaryDirectory);
  const registryMetadata = await withRetry(
    () => Promise.resolve(registryPackageMetadata(packageJson.name, packageJson.version)),
    'npm registry metadata verification'
  );

  validateRegistryMetadata(packageJson, registryMetadata);

  const registryTarball = await withRetry(
    () => fetchRegistryTarball(registryMetadata['dist.tarball']),
    'npm registry tarball download'
  );
  const registryIntegrity = integrityForBuffer(registryTarball, registryMetadata['dist.integrity']);

  if (registryIntegrity !== registryMetadata['dist.integrity']) {
    throw new Error(
      `registry tarball integrity ${registryIntegrity} does not match declared ${registryMetadata['dist.integrity']}`
    );
  }

  const localEntries = packageFileIndex(localTarball);
  const registryEntries = packageFileIndex(registryTarball);
  assertPackageContentsEqual(localEntries, registryEntries);

  console.log(
    JSON.stringify(
      {
        ok: true,
        package: packageJson.name,
        version: packageJson.version,
        integrity: registryMetadata['dist.integrity'],
        tarball: registryMetadata['dist.tarball'],
        files: registryEntries.size
      },
      null,
      2
    )
  );
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
