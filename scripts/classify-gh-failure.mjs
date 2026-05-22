import fs from 'node:fs';

const inputPath = process.argv[2];
const text = inputPath ? fs.readFileSync(inputPath, 'utf8') : fs.readFileSync(0, 'utf8');
const lower = text.toLowerCase();

const rules = [
  ['workflow syntax/actionlint', ['actionlint', 'workflow is not valid', 'yaml']],
  ['zizmor issue', ['zizmor']],
  ['secret scan finding', ['gitleaks', 'secret', 'token', 'private key']],
  ['CodeQL finding', ['codeql']],
  ['dependency audit finding', ['audit', 'vulnerability', 'cve', 'ghsa']],
  ['Docker build failure', ['docker build', 'dockerfile', 'buildx']],
  ['test failure', ['jest', 'test suites:', 'failed tests']],
  ['typecheck failure', ['tsc', 'typescript', 'ts2']],
  ['lint failure', ['eslint', 'prettier', 'format:check']],
  ['package build failure', ['pnpm pack', 'npm pack', 'package tarball']],
  ['metadata drift', ['metadata', 'server.json', 'mcp.json']],
  ['release tag/version mismatch', ['release-please', 'tag', 'version mismatch']],
  ['npm publish/auth/provenance failure', ['npm publish', 'provenance', 'trusted publishing']],
  ['HTTP auth/origin regression', ['http auth', 'bearer', 'authorization', 'origin']],
  ['credential redaction regression', ['redaction', 'credential', 'pat']],
  ['flaky/infra failure', ['timed out', 'rate limit', 'runner', 'network']]
];

const match = rules.find(([, keywords]) => keywords.some((keyword) => lower.includes(keyword)));
const classification = match?.[0] ?? 'unknown';
const publishMustStop = [
  'secret scan finding',
  'CodeQL finding',
  'dependency audit finding',
  'release tag/version mismatch',
  'npm publish/auth/provenance failure',
  'HTTP auth/origin regression',
  'credential redaction regression'
].includes(classification);

console.log(
  JSON.stringify(
    {
      classification,
      root_cause: classification === 'unknown' ? 'No known pattern matched the supplied log.' : `Matched ${classification} indicators in the supplied log.`,
      recommended_fix:
        classification === 'unknown'
          ? 'Inspect the failing job log manually, isolate the first failing command, and add a classifier rule if recurring.'
          : 'Inspect the first failing command in the matched gate, reproduce it locally, and fix the underlying source/configuration.',
      auto_fix_allowed: !publishMustStop,
      human_approval_required: publishMustStop,
      publish_must_stop: publishMustStop
    },
    null,
    2
  )
);
