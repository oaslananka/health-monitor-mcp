# Codecov Coverage and Test Analytics Design

**Issue:** #89 — Add Codecov coverage and test analytics observability

## Context

The repository already enforces Jest coverage thresholds locally and in GitHub Actions. It does not currently publish LCOV coverage or JUnit test results, so pull requests lack Codecov project/patch trends, file-level comments, failed-test summaries, and flaky-test analytics.

This is a Node.js/TypeScript MCP package compiled with `tsc`. It does not ship a browser application bundle through Rollup, Vite, or Webpack.

## Goals

- Keep the existing Jest thresholds as the blocking coverage source of truth.
- Generate deterministic `coverage/lcov.info` and `reports/junit/junit.xml` files from one complete CI test run.
- Upload coverage and test results after tests, including when tests fail but the workflow is not cancelled.
- Pin Codecov actions to immutable commits.
- Add a validated root `codecov.yml` with informational project and patch statuses.
- Add a concise Codecov PR comment and a public README badge.
- Document report paths, token expectations, and the Bundle Analysis decision.

## Non-goals

- Replacing local Jest thresholds with Codecov checks.
- Making Codecov a required merge check during initial adoption.
- Adding OIDC permissions when the existing `CODECOV_TOKEN` secret is available.
- Adding Rollup, Vite, Webpack, or a bundle plugin solely for Bundle Analysis.
- Creating multiple components, carryforward flags, or monorepo policy.

## Approaches considered

### Blocking Codecov immediately

This provides centralized enforcement but makes first-baseline problems or an external service outage capable of blocking healthy pull requests. It duplicates the existing deterministic Jest gate.

**Decision:** Rejected for initial adoption.

### Informational Codecov over the blocking Jest gate

Local thresholds continue to fail CI deterministically. Codecov adds trends, patch visibility, comments, failed-test reporting, and flaky-test analytics without becoming a merge availability dependency.

**Decision:** Selected.

### Coverage upload only

This is simpler but omits failed-test reporting and Test Analytics.

**Decision:** Rejected.

## Report generation

Add `jest-junit@17.0.0` as a development dependency. Keep normal local test commands unchanged. Add:

- `ci:static` for build, typecheck, lint, formatting, and generated docs checks;
- `test:ci` for the complete Jest suite with coverage, the default reporter, and `jest-junit`;
- `ci:check` as `ci:static` followed by `test:ci`.

Make Jest coverage output explicit with `coverageDirectory: 'coverage'` and `coverageReporters: ['text', 'lcov']`. Configure JUnit output at `reports/junit/junit.xml`. Both directories are generated and ignored by Git.

## GitHub Actions integration

Use the current official actions as of 2026-07-21, pinned to immutable commits:

- `codecov/codecov-action` v7.0.0 at `fb8b3582c8e4def4969c97caa2f19720cb33a72f`;
- `codecov/test-results-action` v1.2.1 at `0fa95f0e1eeaafde2c782583b36b28ad0d8c77d3`.

The repository already has `CODECOV_TOKEN`. Use it instead of adding `id-token: write`. Add both upload steps directly after `pnpm run ci:check`, with explicit report paths, `disable_search: true`, `fail_ci_if_error: false`, and `if: ${{ !cancelled() }}`.

The repository restricts third-party Actions. Extend the selected-actions allowlist with the two exact Codecov action pins while preserving the existing Release Please and Scorecard entries.

## Codecov policy

Add root `codecov.yml` with:

- `require_ci_to_pass: true` and `wait_for_ci: true`;
- project status using `target: auto`, a 1% threshold, and `informational: true`;
- patch status using an 80% target, a 5% threshold, and `informational: true`;
- one `unit-integration` flag scoped to `src/`;
- PR comment layout `diff, flags, files`;
- ignored generated, documentation, and test paths.

Validate the file with Codecov's public validator before merge.

## Bundle Analysis decision

Codecov Bundle Analysis requires a supported bundler integration. This package ships server-side Node.js entrypoints compiled with `tsc`; gzip/download size of a browser bundle is not a current product metric. Do not add a bundler or Codecov bundle plugin. Revisit only if a bundled web dashboard, browser client, or frontend package is added.

## Testing

Extend `test/unit/quality-gates.test.ts` to enforce:

- CI-specific LCOV/JUnit generation;
- immutable Codecov action pins;
- `!cancelled()` upload conditions;
- explicit report paths and token use;
- non-blocking upload policy;
- informational Codecov project and patch statuses;
- Bundle Analysis remaining disabled.

Validation order:

1. Add failing quality-gate assertions and observe RED.
2. Add report generation and observe partial GREEN.
3. Add workflow and `codecov.yml`, validate online, and reach GREEN.
4. Update documentation.
5. Run full CI, pre-commit, actionlint, zizmor, audit, metadata, and package gates.
6. Open one PR linked to #89 and inspect all bot/agent feedback.
7. Merge only when clean, then publish and verify pending v1.1.0 from the resulting main commit before closing #77.

## Rollback

The change is additive. If Codecov is unavailable, local tests and thresholds continue to protect the repository. Rollback removes the two upload steps, `codecov.yml`, and JUnit generation; no application runtime or stored data is affected.
