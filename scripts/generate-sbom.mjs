import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EVIDENCE_DIR = 'security-evidence';
const SBOM_TARGETS = [
  { format: 'cyclonedx', file: 'sbom.cyclonedx.json' },
  { format: 'spdx', file: 'sbom.spdx.json' }
];

function runSbom(format) {
  const args = ['sbom', '--prod', '--sbom-format', format];
  const options = {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  };
  const result =
    process.platform === 'win32'
      ? spawnSync(`pnpm ${args.join(' ')}`, { ...options, shell: true })
      : spawnSync('pnpm', args, options);

  if (result.status !== 0) {
    throw new Error(`pnpm sbom ${format} failed: ${result.stderr || result.stdout || result.error}`);
  }

  return result.stdout;
}

function validateSbom(format, content) {
  const sbom = JSON.parse(content);

  if (format === 'cyclonedx' && sbom.bomFormat !== 'CycloneDX') {
    throw new Error('CycloneDX SBOM did not report bomFormat=CycloneDX');
  }

  if (format === 'spdx' && sbom.spdxVersion !== 'SPDX-2.3') {
    throw new Error('SPDX SBOM did not report spdxVersion=SPDX-2.3');
  }
}

fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

for (const target of SBOM_TARGETS) {
  const content = runSbom(target.format);
  validateSbom(target.format, content);
  fs.writeFileSync(path.join(EVIDENCE_DIR, target.file), content);
  console.log(`wrote ${path.join(EVIDENCE_DIR, target.file)}`);
}
