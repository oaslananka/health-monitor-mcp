# Codecov Coverage and Test Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add non-blocking Codecov coverage and failed-test observability while preserving the repository's existing blocking Jest coverage gates, then publish the pending v1.1.0 release from the verified main commit.

**Architecture:** The CI validation job generates one full Jest run with LCOV and JUnit outputs. Immutable Codecov actions upload those reports with the existing repository token, while `codecov.yml` defines informational project/patch policies. Existing Jest thresholds remain authoritative and Bundle Analysis stays disabled because the package has no application bundler.

**Tech Stack:** Node.js 24.18.0, pnpm 11.0.9, Jest 29, ts-jest, jest-junit 17.0.0, GitHub Actions, Codecov Action v7.0.0, Codecov Test Results Action v1.2.1.

## Global Constraints

- Keep local Jest thresholds blocking: lines/functions/statements >= 80%, branches >= 70%.
- Codecov project and patch statuses start with `informational: true`.
- Use existing `CODECOV_TOKEN`; do not add `id-token: write`.
- Pin Codecov actions to `fb8b3582c8e4def4969c97caa2f19720cb33a72f` and `0fa95f0e1eeaafde2c782583b36b28ad0d8c77d3`.
- Generate `coverage/lcov.info` and `reports/junit/junit.xml` from one complete CI test run.
- Use `fail_ci_if_error: false` and `if: ${{ !cancelled() }}` for both uploads.
- Do not add Rollup, Vite, Webpack, or a Codecov bundle plugin.
- Preserve Node.js 24.18.0 and pnpm 11.0.9.

---

### Task 1: Define the Codecov quality-gate contract

**Files:**
- Modify: `test/unit/quality-gates.test.ts`
- Test: `test/unit/quality-gates.test.ts`

**Interfaces:**
- Consumes: `readProjectJson()` and `readProjectText()`.
- Produces: regression assertions for report generation, immutable actions, workflow policy, and `codecov.yml`.

- [ ] **Step 1: Add the failing test**

Append inside the existing `describe` block:

```ts
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

  expect(ciWorkflow).toContain(
    'codecov/codecov-action@fb8b3582c8e4def4969c97caa2f19720cb33a72f'
  );
  expect(ciWorkflow).toContain(
    'codecov/test-results-action@0fa95f0e1eeaafde2c782583b36b28ad0d8c77d3'
  );
  expect(ciWorkflow.match(/if: \$\{\{ !cancelled\(\) \}\}/g)).toHaveLength(2);
  expect(ciWorkflow).toContain('files: ./coverage/lcov.info');
  expect(ciWorkflow).toContain('file: ./reports/junit/junit.xml');
  expect(ciWorkflow).toContain('token: ${{ secrets.CODECOV_TOKEN }}');
  expect(ciWorkflow).toContain('disable_search: true');
  expect(ciWorkflow).toContain('fail_ci_if_error: false');
  expect(ciWorkflow).not.toContain('id-token: write');

  expect(codecovConfig).toContain('target: auto');
  expect(codecovConfig).toContain('target: 80%');
  expect(codecovConfig.match(/informational: true/g)).toHaveLength(2);
  expect(codecovConfig).toContain('layout: "diff, flags, files"');
  expect(codecovConfig).toContain('unit-integration:');
  expect(codecovConfig).not.toContain('bundle_analysis:');
  expect(gitignore).toContain('reports/');
});
```

- [ ] **Step 2: Verify RED**

```bash
mise x node@24.18.0 -- corepack pnpm exec jest \
  --runTestsByPath test/unit/quality-gates.test.ts --runInBand
```

Expected: FAIL because the new scripts, workflow steps, `codecov.yml`, and report ignore path do not exist.

- [ ] **Step 3: Commit the test contract**

```bash
git add test/unit/quality-gates.test.ts
git commit -m "test: define Codecov observability contract"
```

---

### Task 2: Generate deterministic LCOV and JUnit reports

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `jest.config.cjs`
- Modify: `.gitignore`
- Modify: `AGENTS.md`
- Test: `test/unit/quality-gates.test.ts`

**Interfaces:**
- Consumes: existing Jest configuration and coverage thresholds.
- Produces: `pnpm run test:ci`, `coverage/lcov.info`, and `reports/junit/junit.xml`.

- [ ] **Step 1: Add the approved dependency**

```bash
mise x node@24.18.0 -- corepack pnpm add -D jest-junit@17.0.0
```

- [ ] **Step 2: Add CI scripts and JUnit configuration**

Add scripts:

```json
"ci:static": "pnpm run build && pnpm run typecheck && pnpm run lint && pnpm run lint:test && pnpm run format:check && pnpm run docs:api:check",
"test:ci": "node --experimental-vm-modules node_modules/jest/bin/jest.js --coverage --reporters=default --reporters=jest-junit",
"ci:check": "pnpm run ci:static && pnpm run test:ci"
```

Add top-level package configuration:

```json
"jest-junit": {
  "outputDirectory": "reports/junit",
  "outputName": "junit.xml",
  "suiteNameTemplate": "{filepath}",
  "classNameTemplate": "{filepath}",
  "titleTemplate": "{title}",
  "ancestorSeparator": " › "
}
```

- [ ] **Step 3: Make coverage outputs explicit**

Add to `jest.config.cjs` before `coverageThreshold`:

```js
coverageDirectory: 'coverage',
coverageReporters: ['text', 'lcov'],
```

Keep existing thresholds unchanged.

- [ ] **Step 4: Ignore generated reports**

Add to `.gitignore`:

```gitignore
reports/
```

- [ ] **Step 5: Add the dependency policy row**

Add to `AGENTS.md` approved pins:

```markdown
| `jest-junit`                       | `17.0.0`  | Generate JUnit XML for Codecov Test Analytics while retaining Jest 29 as the test runner.                                               |
```

- [ ] **Step 6: Generate and inspect reports**

```bash
rm -rf coverage reports
mise x node@24.18.0 -- corepack pnpm run test:ci
test -s coverage/lcov.info
test -s reports/junit/junit.xml
grep -q '<testsuites' reports/junit/junit.xml
grep -q '^SF:' coverage/lcov.info
```

Expected: all commands exit 0.

- [ ] **Step 7: Run focused test**

Run the Task 1 command. Expected: only workflow and `codecov.yml` assertions remain failing.

- [ ] **Step 8: Commit report generation**

```bash
git add package.json pnpm-lock.yaml jest.config.cjs .gitignore AGENTS.md
git commit -m "test: generate LCOV and JUnit CI reports"
```

---

### Task 3: Add Codecov workflow uploads and repository policy

**Files:**
- Create: `codecov.yml`
- Modify: `.github/workflows/ci.yml`
- External: repository selected-actions allowlist
- Test: `test/unit/quality-gates.test.ts`

**Interfaces:**
- Consumes: LCOV, JUnit, and `CODECOV_TOKEN`.
- Produces: coverage upload, Test Analytics upload, project/patch statuses, and PR comments.

- [ ] **Step 1: Create `codecov.yml`**

```yaml
# Validate changes with:
# curl --fail --data-binary @codecov.yml https://codecov.io/validate
codecov:
  require_ci_to_pass: true
  notify:
    wait_for_ci: true

coverage:
  precision: 2
  round: down
  range: "80...100"
  status:
    project:
      default:
        target: auto
        threshold: 1%
        base: auto
        if_ci_failed: error
        informational: true
    patch:
      default:
        target: 80%
        threshold: 5%
        base: auto
        if_ci_failed: error
        informational: true

comment:
  layout: "diff, flags, files"
  behavior: default
  require_changes: false
  require_base: false
  require_head: true
  hide_project_coverage: false

flags:
  unit-integration:
    paths:
      - src/
    carryforward: false

ignore:
  - "dist/**"
  - "docs/**"
  - "test/**"
```

- [ ] **Step 2: Add immutable upload steps after `pnpm run ci:check`**

```yaml
      - name: Upload coverage to Codecov
        if: ${{ !cancelled() }}
        uses: codecov/codecov-action@fb8b3582c8e4def4969c97caa2f19720cb33a72f # v7.0.0
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
          files: ./coverage/lcov.info
          flags: unit-integration
          name: health-monitor-mcp
          disable_search: true
          fail_ci_if_error: false

      - name: Upload test results to Codecov
        if: ${{ !cancelled() }}
        uses: codecov/test-results-action@0fa95f0e1eeaafde2c782583b36b28ad0d8c77d3 # v1.2.1
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
          file: ./reports/junit/junit.xml
          flags: unit-integration
          name: health-monitor-mcp-tests
          disable_search: true
          fail_ci_if_error: false
```

- [ ] **Step 3: Extend selected-actions permissions**

Preserve existing entries and add the two exact Codecov patterns:

```json
{
  "github_owned_allowed": true,
  "verified_allowed": false,
  "patterns_allowed": [
    "googleapis/release-please-action@45996ed1f6d02564a971a2fa1b5860e934307cf7",
    "ossf/scorecard-action@4eaacf0543bb3f2c246792bd56e8cdeffafb205a",
    "codecov/codecov-action@fb8b3582c8e4def4969c97caa2f19720cb33a72f",
    "codecov/test-results-action@0fa95f0e1eeaafde2c782583b36b28ad0d8c77d3"
  ]
}
```

Read the setting back and verify all four patterns.

- [ ] **Step 4: Validate online**

```bash
curl --silent --show-error --fail \
  --data-binary @codecov.yml \
  https://codecov.io/validate
```

Expected: HTTP 200.

- [ ] **Step 5: Run focused tests and workflow linters**

```bash
mise x node@24.18.0 -- corepack pnpm exec jest \
  --runTestsByPath test/unit/quality-gates.test.ts --runInBand
actionlint .github/workflows/*.yml
zizmor --offline --min-severity low .github/workflows
```

Use the repository-pinned actionlint 1.7.12 and zizmor 1.24.1 installations if shims are unavailable.

- [ ] **Step 6: Commit integration**

```bash
git add codecov.yml .github/workflows/ci.yml
git commit -m "ci: upload coverage and test results to Codecov"
```

---

### Task 4: Document observability and Bundle Analysis deferral

**Files:**
- Modify: `README.md`
- Modify: `docs/development.md`
- Modify: `docs/operations.md`

**Interfaces:**
- Consumes: report paths and policy from Tasks 2–3.
- Produces: maintainer setup and user-facing coverage visibility.

- [ ] **Step 1: Add the public badge**

```markdown
[![codecov](https://codecov.io/gh/oaslananka/health-monitor-mcp/graph/badge.svg)](https://codecov.io/gh/oaslananka/health-monitor-mcp)
```

Place below the CI badge.

- [ ] **Step 2: Add a README coverage section**

State that local Jest thresholds remain blocking, Codecov statuses are informational during adoption, LCOV/JUnit power PR and failed-test visibility, and Bundle Analysis is deferred because there is no supported browser bundler.

- [ ] **Step 3: Add development report documentation**

```markdown
## Coverage and Test Reports

`pnpm run test:ci` runs the complete Jest suite once and writes:

- `coverage/lcov.info` for Codecov coverage ingestion;
- `reports/junit/junit.xml` for Codecov Test Analytics and failed-test reporting.

Both directories are generated and ignored by Git. `pnpm run test:coverage` remains available for a normal local coverage run without the JUnit reporter.
```

- [ ] **Step 4: Add operations documentation**

Document `CODECOV_TOKEN`, exact action pins, selected-actions permissions, non-blocking uploads, informational statuses, YAML validation, and Bundle Analysis deferral.

- [ ] **Step 5: Format, test, and commit**

```bash
mise x node@24.18.0 -- corepack pnpm exec prettier --write \
  README.md docs/development.md docs/operations.md
mise x node@24.18.0 -- corepack pnpm exec jest \
  --runTestsByPath test/unit/quality-gates.test.ts --runInBand
git diff --check
git add README.md docs/development.md docs/operations.md
git commit -m "docs: explain Codecov coverage observability"
```

---

### Task 5: Full verification, PR, bot review, and merge

**Files:**
- Verify all branch changes.

**Interfaces:**
- Produces: one merged PR closing #89.

- [ ] **Step 1: Run fresh complete verification**

```bash
rm -rf coverage reports
mise x node@24.18.0 -- corepack pnpm run ci
test -s coverage/lcov.info
test -s reports/junit/junit.xml
pre-commit run --all-files --hook-stage pre-commit
curl --silent --show-error --fail --data-binary @codecov.yml https://codecov.io/validate
actionlint .github/workflows/*.yml
zizmor --offline --min-severity low .github/workflows
git diff --check
git status --short --branch
```

Expected: all commands exit 0 and the worktree is clean.

- [ ] **Step 2: Push and open one PR**

Push `ci/89-codecov-observability` and create `ci: add Codecov coverage and test analytics` with `Closes #89`.

- [ ] **Step 3: Inspect all automation**

Review GitHub Actions, Codecov, Snyk, SonarQube Cloud, Semgrep, CodeQL, Socket, dependency review, Renovate, review-thread gate, and every bot/agent comment or review. Resolve all actionable findings.

- [ ] **Step 4: Squash merge only with clean evidence**

Confirm the PR head SHA matches the verified branch, all required checks are successful, and no unresolved review thread remains. Squash merge and sync canonical main.

---

### Task 6: Publish and verify v1.1.0, then close #77

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: merged main commit with synchronized 1.1.0 metadata.
- Produces: exact tag, GitHub Release, npm, GHCR, MCP Registry, and closed #77.

- [ ] **Step 1: Verify release state on main**

```bash
git fetch origin main --tags
git reset --hard origin/main
pnpm run ci
node scripts/release-state.mjs --dry-run
```

- [ ] **Step 2: Create `health-monitor-mcp-v1.1.0` from the exact verified main SHA**

Create the GitHub Release against the same commit. Do not publish from a divergent local commit.

- [ ] **Step 3: Verify workflows and public surfaces**

Confirm release assets/checksums, npm trusted publishing, GHCR SBOM/provenance, and MCP Registry publication. Run:

```bash
node scripts/release-state.mjs --require-tag
node scripts/verify-npm-package.mjs
gh release view health-monitor-mcp-v1.1.0
npm view health-monitor-mcp@1.1.0 version dist.integrity --json
```

- [ ] **Step 4: Close #77 with evidence**

Post tag, commit, npm integrity, release assets, GHCR digest, MCP Registry version, and successful workflow URLs. Remove stale `release-please--*` branches, then close #77.
