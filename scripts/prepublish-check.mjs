import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

function resolveCommand(command) {
  if (process.platform !== 'win32') {
    return command;
  }

  if (command === 'pnpm') {
    return `${command}.cmd`;
  }

  return command;
}

function runStep(label, command, args) {
  console.log(`=== ${label} ===`);
  const resolvedCommand = resolveCommand(command);
  const result =
    process.platform === 'win32'
      ? spawnSync('cmd.exe', ['/d', '/s', '/c', resolvedCommand, ...args], { stdio: 'inherit' })
      : spawnSync(resolvedCommand, args, { stdio: 'inherit' });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

runStep('Quality gate', 'pnpm', ['run', 'ci:check']);
runStep('Coverage gate', 'pnpm', ['run', 'test:coverage']);
runStep('Pack dry-run', 'pnpm', ['pack', '--dry-run']);

const binPath = new URL('../dist/mcp.js', import.meta.url);
const firstLine = fs.readFileSync(binPath, 'utf8').split('\n', 1)[0] ?? '';

if (firstLine !== '#!/usr/bin/env node') {
  console.error('dist/mcp.js is missing the expected shebang.');
  process.exit(1);
}

runStep('CLI smoke test', 'node', ['dist/mcp.js', '--version']);

console.log('=== All checks passed. Ready to publish. ===');
console.log('Publish only through the guarded release workflow.');
