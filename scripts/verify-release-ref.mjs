import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function runGit(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });

  if (result.status !== 0) {
    return null;
  }

  return result.stdout.trim();
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

const tagArgumentIndex = process.argv.indexOf('--tag');
const suppliedTag = tagArgumentIndex >= 0 ? process.argv[tagArgumentIndex + 1] : process.env.GITHUB_REF_NAME;

const packageJson = readJson('package.json');
const mcpJson = readJson('mcp.json');
const serverJson = readJson('server.json');
const releaseManifest = readJson('.release-please-manifest.json');
const npmPackage = Array.isArray(serverJson.packages)
  ? serverJson.packages.find((entry) => entry.registryType === 'npm')
  : undefined;
const versions = [
  packageJson.version,
  mcpJson.version,
  serverJson.version,
  npmPackage?.version,
  releaseManifest['.']
];

if (versions.some((version) => version !== packageJson.version)) {
  fail('release metadata versions are not synchronized');
} else if (
  packageJson.mcpName !== mcpJson.mcpName ||
  packageJson.mcpName !== serverJson.name ||
  npmPackage?.identifier !== packageJson.name
) {
  fail('release package and MCP identities are not synchronized');
} else {
  const expectedTag = `${packageJson.name}-v${packageJson.version}`;
  const tagName = suppliedTag ?? expectedTag;

  if (tagName !== expectedTag) {
    fail(`expected release tag ${expectedTag}, received ${tagName}`);
  } else {
    const tagCommit = runGit(['rev-parse', '--verify', `${tagName}^{commit}`]);

    if (!tagCommit) {
      fail(`release tag ${tagName} does not exist`);
    } else {
      const headCommit = runGit(['rev-parse', 'HEAD']);

      if (!headCommit) {
        fail('unable to resolve HEAD commit');
      } else if (tagCommit !== headCommit) {
        fail(`release tag ${tagName} does not point at HEAD`);
      } else {
        console.log(
          JSON.stringify(
            {
              package: packageJson.name,
              version: packageJson.version,
              tag_name: tagName,
              commit: headCommit
            },
            null,
            2
          )
        );
      }
    }
  }
}
