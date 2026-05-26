import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EVIDENCE_DIR = 'security-evidence';
const ALLOWED_LICENSES = new Set(['Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'MIT']);

function runLicenseReport() {
  const args = ['licenses', 'list', '--prod', '--json'];
  const options = {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  };
  const result =
    process.platform === 'win32'
      ? spawnSync(`pnpm ${args.join(' ')}`, { ...options, shell: true })
      : spawnSync('pnpm', args, options);

  if (result.status !== 0) {
    throw new Error(`pnpm licenses failed: ${result.stderr || result.stdout || result.error}`);
  }

  return JSON.parse(result.stdout);
}

function hasAllowedOption(expression) {
  return expression
    .replace(/[()]/g, '')
    .split(/\s+OR\s+/i)
    .some((option) =>
      option
        .split(/\s+AND\s+/i)
        .map((license) => license.trim())
        .every((license) => ALLOWED_LICENSES.has(license))
    );
}

function collectViolations(report) {
  return Object.entries(report)
    .filter(([expression]) => !hasAllowedOption(expression))
    .flatMap(([expression, packages]) =>
      packages.map((pkg) => `${pkg.name}@${pkg.versions.join(',')} uses ${expression}`)
    );
}

const report = runLicenseReport();
const violations = collectViolations(report);

fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
fs.writeFileSync(path.join(EVIDENCE_DIR, 'licenses.json'), JSON.stringify(report, null, 2));

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log(`license policy passed for ${Object.keys(report).length} license expression(s)`);
