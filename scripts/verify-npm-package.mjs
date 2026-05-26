import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const DEFAULT_ATTEMPTS = 6;
const DEFAULT_RETRY_DELAY_MS = 10000;
const NPM_REGISTRY_URL = 'https://registry.npmjs.org';

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

function localPackMetadata() {
  const result = run('npm', ['pack', '--json', '--dry-run']);

  if (result.status !== 0) {
    throw new Error(`npm pack --dry-run failed: ${result.stderr || result.stdout}`);
  }

  const metadata = parseJson(result.stdout, 'npm pack --dry-run');
  const entry = Array.isArray(metadata) ? metadata[0] : metadata;

  if (!entry?.integrity) {
    throw new Error('npm pack --dry-run did not report package integrity');
  }

  return entry;
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
    throw new Error(result.stderr || result.stdout || `npm view failed for ${packageName}@${version}`);
  }

  return parseJson(result.stdout, 'npm view');
}

async function registryPackageMetadataWithRetry(packageName, version) {
  const attempts = positiveIntegerFromEnv('NPM_VERIFY_ATTEMPTS', DEFAULT_ATTEMPTS);
  const retryDelayMs = positiveIntegerFromEnv('NPM_VERIFY_DELAY_MS', DEFAULT_RETRY_DELAY_MS);
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return registryPackageMetadata(packageName, version);
    } catch (error) {
      lastError = error;

      if (attempt < attempts) {
        await sleep(retryDelayMs);
      }
    }
  }

  throw lastError;
}

function assertRegistryMatchesLocal(packageJson, registryMetadata, packMetadata) {
  if (registryMetadata.version !== packageJson.version) {
    throw new Error(
      `registry version ${registryMetadata.version} does not match package ${packageJson.version}`
    );
  }

  if (registryMetadata['dist.integrity'] !== packMetadata.integrity) {
    throw new Error(
      `registry integrity ${registryMetadata['dist.integrity']} does not match local pack ${packMetadata.integrity}`
    );
  }
}

const packageJson = readJson('package.json');
const packMetadata = localPackMetadata();
const registryMetadata = await registryPackageMetadataWithRetry(packageJson.name, packageJson.version);

assertRegistryMatchesLocal(packageJson, registryMetadata, packMetadata);

console.log(
  JSON.stringify(
    {
      ok: true,
      package: packageJson.name,
      version: packageJson.version,
      integrity: registryMetadata['dist.integrity'],
      tarball: registryMetadata['dist.tarball']
    },
    null,
    2
  )
);
