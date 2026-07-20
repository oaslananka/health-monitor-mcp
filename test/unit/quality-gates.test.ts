import { createRequire } from 'node:module';

import {
  createPackageScriptExpectation,
  readProjectJson,
  readProjectText
} from '../fixtures/project.js';

type PackageJson = {
  scripts: Record<string, string>;
};

type RenovateConfig = {
  extends: string[];
  labels?: string[];
  dependencyDashboardLabels?: string[];
  vulnerabilityAlerts?: { labels?: string[] };
  packageRules?: Array<{ addLabels?: string[] }>;
  'pre-commit'?: { enabled?: boolean };
};

type CoverageThreshold = {
  branches: number;
  functions: number;
  lines: number;
  statements: number;
};

type JestConfig = {
  collectCoverageFrom?: string[];
  coverageThreshold?: {
    global?: CoverageThreshold;
  };
};

const require = createRequire(import.meta.url);
const jestConfig = require('../../jest.config.cjs') as JestConfig;

describe('quality gate regression checks', () => {
  it('runs coverage thresholds in the regular CI check path', () => {
    const packageJson = readProjectJson<PackageJson>('package.json');
    const coverageThreshold = jestConfig.coverageThreshold?.global;

    expect(packageJson.scripts['test:coverage']).toContain('--coverage');
    expect(packageJson.scripts['ci:check']).toContain('pnpm run test:coverage');
    expect(jestConfig.collectCoverageFrom).toEqual(expect.arrayContaining(['src/**/*.ts']));
    expect(coverageThreshold).toEqual(
      expect.objectContaining({
        branches: expect.any(Number),
        functions: expect.any(Number),
        lines: expect.any(Number),
        statements: expect.any(Number)
      })
    );
    expect(coverageThreshold?.branches).toBeGreaterThanOrEqual(70);
    expect(coverageThreshold?.functions).toBeGreaterThanOrEqual(80);
    expect(coverageThreshold?.lines).toBeGreaterThanOrEqual(80);
    expect(coverageThreshold?.statements).toBeGreaterThanOrEqual(80);
  });

  it('keeps release and security verification in the full CI path', () => {
    const packageJson = readProjectJson<PackageJson>('package.json');
    const ciWorkflow = readProjectText('.github/workflows/ci.yml');
    const expectations = [
      createPackageScriptExpectation('ci', [
        'pnpm run ci:check',
        'pnpm run security',
        'pnpm run security:supply-chain',
        'pnpm run check:metadata',
        'pnpm run check:package',
        'pnpm run release:dry-run'
      ]),
      createPackageScriptExpectation('security:supply-chain', [
        'pnpm run security:sbom',
        'pnpm run security:licenses',
        'pnpm run security:reuse'
      ])
    ];

    for (const expectation of expectations) {
      const script = packageJson.scripts[expectation.scriptName];

      for (const command of expectation.requiredCommands) {
        expect(script).toContain(command);
      }
    }

    expect(packageJson.scripts['setup:security']).toContain('reuse==6.2.0');
    expect(packageJson.scripts['security:reuse']).toBe('python -m reuse lint');
    expect(ciWorkflow).toContain('reuse==6.2.0');
    expect(ciWorkflow).toContain('pnpm run ci:check');
    expect(ciWorkflow).toContain('pnpm run security:supply-chain');
    expect(ciWorkflow).toContain('pnpm run release:dry-run');
  });

  it('keeps dependency automation and security tooling policy enforceable', () => {
    const packageJson = readProjectJson<PackageJson>('package.json');
    const renovateConfig = readProjectJson<RenovateConfig>('renovate.json');
    const preCommitConfig = readProjectText('.pre-commit-config.yaml');
    const semgrepWorkflow = readProjectText('.github/workflows/semgrep.yml');
    const semgrepRules = readProjectText('.semgrep.yml');
    const sonarConfig = readProjectText('.sonarcloud.properties');
    const configuredLabels = [
      ...(renovateConfig.labels ?? []),
      ...(renovateConfig.dependencyDashboardLabels ?? []),
      ...(renovateConfig.vulnerabilityAlerts?.labels ?? []),
      ...(renovateConfig.packageRules ?? []).flatMap((rule) => rule.addLabels ?? [])
    ];

    expect(renovateConfig.extends).toContain('config:best-practices');
    expect(renovateConfig['pre-commit']?.enabled).toBe(true);
    expect(configuredLabels).not.toEqual(
      expect.arrayContaining([
        'automerge',
        'ci',
        'docker',
        'github-actions',
        'javascript',
        'lockfile',
        'major',
        'requires-review',
        'runtime',
        'security'
      ])
    );

    expect(preCommitConfig).toContain('pre-commit/pre-commit-hooks');
    expect(preCommitConfig).toContain('semgrep/pre-commit');
    expect(preCommitConfig).toContain('security:snyk');
    expect(preCommitConfig).toContain('sonar-secrets');
    expect(preCommitConfig).toContain('stages: [pre-push]');

    expect(semgrepWorkflow).toContain('semgrep ci');
    expect(semgrepWorkflow).toContain('SEMGREP_APP_TOKEN');
    expect(semgrepWorkflow).toContain('semgrep/semgrep:1.170.0@sha256:');
    expect(semgrepRules).toContain('no-runtime-stdout');
    expect(semgrepRules).toContain('no-shell-true');

    expect(sonarConfig).toContain('sonar.sources=src');
    expect(sonarConfig).toContain('sonar.tests=test');
    expect(sonarConfig).toContain('sonar.sourceEncoding=UTF-8');

    expect(packageJson.scripts['security:semgrep']).toContain('semgrep scan');
    expect(packageJson.scripts['security:snyk']).toContain('snyk test');
    expect(packageJson.scripts['precommit:run']).toContain('pre-commit run');
  });

  it('keeps npm publish retries idempotent and registry-verified', () => {
    const publishWorkflow = readProjectText('.github/workflows/publish-npm.yml');
    const verifyScript = readProjectText('scripts/verify-npm-package.mjs');

    expect(publishWorkflow).toContain('node scripts/release-state.mjs --require-tag');
    expect(publishWorkflow).toContain('npm_published=');
    expect(publishWorkflow).toContain(
      'npm publish --access public --provenance || node scripts/verify-npm-package.mjs'
    );
    expect(publishWorkflow).toContain('node scripts/verify-npm-package.mjs');
    expect(verifyScript).toContain("npm', ['pack', '--json', '--dry-run']");
    expect(verifyScript).toContain("'dist.integrity'");
  });
});
