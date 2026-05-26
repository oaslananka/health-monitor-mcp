import { spawnSync } from 'node:child_process';

const paths = process.argv.slice(2);

if (paths.length === 0) {
  throw new Error('Usage: node scripts/check-clean-path.mjs <path> [path...]');
}

const result = spawnSync('git', ['status', '--porcelain', '--', ...paths], {
  encoding: 'utf8'
});

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  throw new Error(result.stderr.trim() || 'git status failed');
}

const status = result.stdout.trim();

if (status.length > 0) {
  console.error(`Generated files are not up to date:\n${status}`);
  process.exit(1);
}
