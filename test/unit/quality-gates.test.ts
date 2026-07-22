import { createRequire } from 'node:module';

import {
  createPackageScriptExpectation,
  readProjectJson,
  readProjectText
} from '../fixtures/project.js';

type PackageJson = {
  scripts: Record<string, string>;
  bundleDependencies?: string[];
};

type RenovateConfig = {
  extends: string[];
  labels?: string[];
  dependencyDashboardLabels?: string[];
  vulnerabilityAlerts?: { labels?: string[] };
  packageRules?: Array<{ addLabels?: string[] }>;
  customManagers?: Array<{
    customType?: string;
    managerFilePatterns?: string[];
    matchStrings?: string[];
  }>;
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

function yamlVersion(text: string, key: string): string {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(
    new RegExp(`^\\s{2}["']?${escapedKey}["']?:\\s+(\\d+\\.\\d+\\.\\d+)$`, 'm')
  );

  if (!match?.[1]) throw new Error(`missing version override for ${key}`);
  return match[1];
}

function expectVersionAtLeast(actual: string, minimum: string): void {
  const actualParts = actual.split('.').map(Number);
  const minimumParts = minimum.split('.').map(Number);

  for (let index = 0; index < 3; index += 1) {
    const actualPart = actualParts[index] ?? 0;
    const minimumPart = minimumParts[index] ?? 0;

    if (actualPart > minimumPart) return;
    if (actualPart < minimumPart) {
      throw new Error(`${actual} is below required floor ${minimum}`);
    }
  }
}

describe('quality gate regression checks', () => {
  it('runs coverage thresholds in the regular CI check path', () => {
    const packageJson = readProjectJson<PackageJson>('package.json');
    const coverageThreshold = jestConfig.coverageThreshold?.global;

    expect(packageJson.scripts['test:coverage']).toContain('--coverage');
    expect(packageJson.scripts['ci:check']).toContain('pnpm run test:ci');
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
    const ciWorkflow = readProjectText('.github/workflows/ci.yml');
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

    expect(ciWorkflow).toContain('docker run --rm --volume "$PWD:/workspace:ro"');
    expect(ciWorkflow).toContain('# renovate: datasource=docker depName=renovate/renovate');
    expect(ciWorkflow).toContain('renovate/renovate:43.272.4@sha256:');
    expect(renovateConfig.customManagers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          customType: 'regex',
          managerFilePatterns: expect.arrayContaining([expect.stringContaining('workflows')]),
          matchStrings: expect.arrayContaining([expect.stringContaining('renovate/renovate')])
        })
      ])
    );
    expect(semgrepWorkflow).toContain('semgrep ci');
    expect(semgrepWorkflow).toContain('SEMGREP_APP_TOKEN');
    expect(semgrepWorkflow).toContain('semgrep/semgrep:1.170.0@sha256:');
    expect(semgrepRules).toContain('no-runtime-stdout');
    expect(semgrepRules).toContain('no-shell-true');

    expect(sonarConfig).toContain('sonar.sources=src');
    expect(sonarConfig).toContain('sonar.tests=test');
    expect(sonarConfig).toContain('sonar.sourceEncoding=UTF-8');

    expect(packageJson.scripts['security:semgrep']).toContain('pre-commit run semgrep');
    expect(packageJson.scripts['security:snyk']).toContain('snyk test');
    expect(packageJson.scripts['precommit:run']).toContain('pre-commit run');
  });

  it('pins patched transitive dependency floors for newly disclosed advisories', () => {
    const workspaceConfig = readProjectText('pnpm-workspace.yaml');
    const lockfile = readProjectText('pnpm-lock.yaml');

    expectVersionAtLeast(yamlVersion(workspaceConfig, 'body-parser'), '2.3.0');
    expectVersionAtLeast(yamlVersion(workspaceConfig, '@hono/node-server'), '2.0.5');
    expectVersionAtLeast(yamlVersion(workspaceConfig, 'fast-uri'), '3.1.4');
    expectVersionAtLeast(yamlVersion(workspaceConfig, 'linkify-it'), '5.0.2');

    expect(lockfile).not.toContain('body-parser@2.2.2');
    expect(lockfile).not.toContain('@hono/node-server@1.19.14');
    expect(lockfile).not.toContain('fast-uri@3.1.2');
    expect(lockfile).not.toContain('fast-uri@3.1.3');
    expect(lockfile).not.toContain('linkify-it@5.0.1');
  });

  it('ships the patched MCP SDK graph to downstream npm consumers', () => {
    const packageJson = readProjectJson<PackageJson>('package.json');
    const workspaceConfig = readProjectText('pnpm-workspace.yaml');
    const sdkPatch = readProjectText('patches/@modelcontextprotocol__sdk@1.29.0.patch');
    const dockerfile = readProjectText('Dockerfile');

    expect(packageJson.bundleDependencies).toContain('@modelcontextprotocol/sdk');
    expect(packageJson.scripts['check:package']).toContain('check:consumer-package');
    expect(workspaceConfig).toContain('nodeLinker: hoisted');
    expect(workspaceConfig).toContain('patchedDependencies:');
    expect(workspaceConfig).toContain("'@modelcontextprotocol/sdk@1.29.0':");
    expect(sdkPatch).toContain('"@hono/node-server": "^2.0.5"');
    expect(dockerfile).toContain('COPY patches ./patches');
    expect(dockerfile.indexOf('COPY patches ./patches')).toBeLessThan(
      dockerfile.indexOf('RUN pnpm install --frozen-lockfile')
    );
  });

  it('orchestrates public release surfaces from one exact component tag', () => {
    const packageJson = readProjectJson<PackageJson>('package.json');
    const releaseWorkflow = readProjectText('.github/workflows/release.yml');
    const npmWorkflow = readProjectText('.github/workflows/publish-npm.yml');
    const ghcrWorkflow = readProjectText('.github/workflows/publish-ghcr.yml');
    const registryWorkflow = readProjectText('.github/workflows/publish-mcp-registry.yml');
    const releasePleaseConfig = readProjectText('release-please-config.json');

    expect(releaseWorkflow).toContain('token: ${{ secrets.RELEASE_PLEASE_TOKEN }}');
    expect(releaseWorkflow).toContain('release:verify-ref');

    expect(npmWorkflow).toContain('release:');
    expect(npmWorkflow).toContain('types: [published]');
    expect(npmWorkflow).toContain("github.event_name == 'release'");
    expect(npmWorkflow).toContain('github.event.release.tag_name');
    expect(npmWorkflow).toContain('environment: npm-production');
    expect(npmWorkflow).toContain('release:verify-ref');

    expect(ghcrWorkflow).toContain('verify-release-ref');

    expect(npmWorkflow).toContain('uses: ./.github/workflows/publish-mcp-registry.yml');
    expect(npmWorkflow).toContain('needs: publish');
    expect(registryWorkflow).toContain('workflow_call:');
    expect(registryWorkflow).toContain('inputs:');
    expect(registryWorkflow).toContain('tag_name:');
    expect(registryWorkflow).toContain('verify-release-ref');
    expect(registryWorkflow).toContain("inputs.tag_name != ''");
    expect(registryWorkflow).not.toContain("github.event_name == 'workflow_call'");
    expect(registryWorkflow).not.toContain('workflow_run:');
    expect(registryWorkflow).not.toContain(`release:
    types: [published]`);

    expect(releasePleaseConfig).toContain('.claude-plugin/plugin.json');
    expect(packageJson.scripts['release:verify-ref']).toContain('verify-release-ref.mjs');
  });

  it('keeps npm publish retries idempotent and registry-verified', () => {
    const publishWorkflow = readProjectText('.github/workflows/publish-npm.yml');
    const verifyScript = readProjectText('scripts/verify-npm-package.mjs');

    expect(publishWorkflow).toContain('node scripts/release-state.mjs --require-tag');
    expect(publishWorkflow).toContain('npm_published=');
    expect(publishWorkflow).toContain('pnpm pack --json --pack-destination');
    expect(publishWorkflow).toContain(
      'npm publish "$PACKAGE_TARBALL" --access public --provenance'
    );
    expect(publishWorkflow).toContain(
      'LOCAL_PACKAGE_TARBALL: ${{ steps.package.outputs.tarball }}'
    );
    expect(publishWorkflow).toContain('node scripts/verify-npm-package.mjs');
    expect(verifyScript).toContain('LOCAL_PACKAGE_TARBALL');
    expect(verifyScript).toContain("run('pnpm', ['pack'");
    expect(verifyScript).toContain('packageFileIndex');
    expect(verifyScript).toContain('assertPackageContentsEqual');
    expect(verifyScript).toContain('integrityForBuffer');
    expect(verifyScript).not.toContain('does not match local pack');
  });

  it('keeps generated API docs independent of package version', () => {
    const typedocConfig = readProjectJson<{ includeVersion: boolean }>('typedoc.json');

    expect(typedocConfig.includeVersion).toBe(false);
  });

  it('publishes coverage and test analytics without replacing local coverage gates', () => {
    const packageJson = readProjectJson<PackageJson>('package.json');
    const ciWorkflow = readProjectText('.github/workflows/ci.yml');
    const codecovConfig = readProjectText('codecov.yml');
    const gitignore = readProjectText('.gitignore');

    expect(packageJson.scripts['ci:static']).toContain('pnpm run docs:api:check');
    expect(packageJson.scripts['test:ci']).toContain('--coverage');
    expect(packageJson.scripts['test:ci']).toContain('--reporters=default');
    expect(packageJson.scripts['test:ci']).toContain('--reporters=jest-junit');
    expect(packageJson.scripts['ci:check']).toContain('pnpm run ci:static');
    expect(packageJson.scripts['ci:check']).toContain('pnpm run test:ci');

    expect(ciWorkflow).toContain('codecov/codecov-action@fb8b3582c8e4def4969c97caa2f19720cb33a72f');
    expect(
      ciWorkflow.match(/codecov\/codecov-action@fb8b3582c8e4def4969c97caa2f19720cb33a72f/g)
    ).toHaveLength(2);
    expect(ciWorkflow).not.toContain('codecov/test-results-action@');
    expect(ciWorkflow.match(/if: \$\{\{ !cancelled\(\) \}\}/g)).toHaveLength(2);
    expect(ciWorkflow).toContain('files: ./coverage/lcov.info');
    expect(ciWorkflow).toContain('files: ./reports/junit/junit.xml');
    expect(ciWorkflow).toContain('report_type: test_results');
    expect(ciWorkflow).toContain('token: ${{ secrets.CODECOV_TOKEN }}');
    expect(ciWorkflow).toContain('disable_search: true');
    expect(ciWorkflow).toContain('fail_ci_if_error: false');
    expect(ciWorkflow).not.toContain('id-token: write');

    expect(codecovConfig).toContain('target: auto');
    expect(codecovConfig.match(/target: auto/g)).toHaveLength(2);
    expect(codecovConfig.match(/informational: true/g)).toHaveLength(2);
    expect(codecovConfig).toContain('layout: "diff, flags, files"');
    expect(codecovConfig).toContain('unit-integration:');
    expect(codecovConfig).not.toContain('bundle_analysis:');
    expect(gitignore).toContain('reports/');
  });

  it('keeps container and workflow security checks focused and enforceable', () => {
    const ciWorkflow = readProjectText('.github/workflows/ci.yml');
    const preCommitConfig = readProjectText('.pre-commit-config.yaml');

    expect(ciWorkflow).toContain(
      'aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25'
    );
    expect(ciWorkflow).toContain('image-ref: health-monitor-mcp:ci');
    expect(ciWorkflow).toContain('scanners: vuln');
    expect(ciWorkflow).toContain('severity: HIGH,CRITICAL');
    expect(ciWorkflow).toContain('ignore-unfixed: true');
    expect(ciWorkflow).toContain('exit-code: 1');
    expect(ciWorkflow).toContain('format: sarif');
    expect(ciWorkflow).toContain('output: trivy-results.sarif');
    expect(ciWorkflow).toContain("if: ${{ always() && hashFiles('trivy-results.sarif') != '' }}");
    expect(ciWorkflow).toContain('sarif_file: trivy-results.sarif');
    expect(ciWorkflow).toMatch(
      /docker:[\s\S]*?permissions:[\s\S]*?contents: read[\s\S]*?security-events: write/
    );
    expect(ciWorkflow).not.toContain('scanners: vuln,secret');
    expect(ciWorkflow).not.toContain('merge_group:');

    expect(preCommitConfig).toContain('- id: check-toml');
    expect(preCommitConfig).toContain('- id: mixed-line-ending');
    expect(preCommitConfig).toContain('args: [--fix=no]');
    expect(preCommitConfig).toContain('repo: https://github.com/rhysd/actionlint');
    expect(preCommitConfig).toContain('rev: v1.7.12');
    expect(preCommitConfig).toContain('repo: https://github.com/zizmorcore/zizmor-pre-commit');
    expect(preCommitConfig).toContain('rev: v1.24.1');
  });

  it('keeps the runtime image on patched inputs without build-only package managers', () => {
    const packageJson = readProjectJson<{ packageManager: string }>('package.json');
    const dockerfile = readProjectText('Dockerfile');
    const miseConfig = readProjectText('.mise.toml');
    const runtimeStage = dockerfile.split('FROM ${NODE_IMAGE} AS runtime')[1] ?? '';

    expect(dockerfile).toContain(
      'node:24-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d'
    );
    expect(packageJson.packageManager).toBe('pnpm@11.14.0');
    expect(miseConfig).toContain('pnpm = "11.14.0"');
    expect(dockerfile).toContain('corepack prepare pnpm@11.14.0 --activate');
    expect(dockerfile).toContain('RUN pnpm prune --prod --ignore-scripts');
    expect(runtimeStage).toContain('COPY --from=builder /app/node_modules ./node_modules');
    expect(runtimeStage).not.toContain('corepack enable');
    expect(runtimeStage).not.toContain('corepack prepare');
    expect(runtimeStage).not.toContain('pnpm prune');
    expect(runtimeStage).not.toContain('PNPM_HOME');
    expect(runtimeStage).toContain('/usr/local/lib/node_modules/npm');
    expect(runtimeStage).toContain('/usr/local/lib/node_modules/corepack');
    expect(runtimeStage).toContain('/opt/yarn-v*');
    expect(runtimeStage).toContain('/usr/local/bin/npm');
    expect(runtimeStage).toContain('/usr/local/bin/npx');
  });

  it('documents and publishes the GitHub Actions provider without persisting secrets', () => {
    const mcpMetadata = readProjectJson<{
      description: string;
      tools: string[];
      env: Record<string, { description: string; required: boolean }>;
    }>('mcp.json');
    const serverMetadata = readProjectJson<{
      description: string;
      packages: Array<{
        environmentVariables: Array<{
          name: string;
          description: string;
          isRequired: boolean;
          isSecret: boolean;
        }>;
      }>;
    }>('server.json');
    const readme = readProjectText('README.md');
    const usage = readProjectText('docs/usage.md');
    const architecture = readProjectText('docs/architecture.md');
    const operations = readProjectText('docs/operations.md');
    const security = readProjectText('docs/security-tooling.md');
    const roadmap = readProjectText('ROADMAP.md');

    expect(mcpMetadata.tools).toEqual(
      expect.arrayContaining([
        'register_github_actions',
        'check_github_actions',
        'list_github_actions',
        'unregister_github_actions'
      ])
    );
    expect(mcpMetadata.env.GITHUB_TOKEN).toEqual(
      expect.objectContaining({ required: false, description: expect.stringContaining('Actions') })
    );
    expect(serverMetadata.packages[0]?.environmentVariables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'GITHUB_TOKEN', isRequired: false, isSecret: true })
      ])
    );
    expect(mcpMetadata.description.length).toBeLessThanOrEqual(100);
    expect(serverMetadata.description.length).toBeLessThanOrEqual(100);
    const registryWorkflow = readProjectText('.github/workflows/publish-mcp-registry.yml');
    expect(registryWorkflow).toContain('server.description.length > 100');
    expect(readme).toContain('register_github_actions');
    expect(usage).toContain('token_env="GITHUB_TOKEN"');
    expect(architecture).toContain('github_actions_targets');
    expect(operations).toContain('Actions read');
    expect(security).toContain('Only the environment-variable name');
    expect(roadmap).toContain('GitHub Actions monitoring — complete');
    expect([readme, usage, architecture, operations, security].join('\n')).not.toContain(
      'github_pat_'
    );
  });
});
