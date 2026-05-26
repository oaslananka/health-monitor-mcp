import { createRequire } from 'node:module';

import {
  createPackageScriptExpectation,
  readProjectJson,
  readProjectText
} from '../fixtures/project.js';

type PackageJson = {
  scripts: Record<string, string>;
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

    expect(ciWorkflow).toContain('pnpm run ci:check');
    expect(ciWorkflow).toContain('pnpm run security:supply-chain');
    expect(ciWorkflow).toContain('pnpm run release:dry-run');
  });
});
