# Testing

The stable local interface is:

```bash
pnpm run ci
```

`ci` runs format, lint, typecheck, unit tests, integration tests, security audit, metadata
validation, package dry-run, and release-state dry-run.

The PR gate uses `pnpm run ci:check`, which runs `pnpm run test:coverage` instead of the
non-coverage unit and integration commands. Jest must enforce the configured global thresholds
on every PR:

| Metric | Minimum |
| ------ | ------- |
| Lines | 80% |
| Statements | 80% |
| Functions | 80% |
| Branches | 70% |

Focused commands:

```bash
pnpm test
pnpm run test:integration
pnpm run test:coverage
pnpm run lint
pnpm run lint:test
pnpm run typecheck
pnpm run docs:api
pnpm run docs:api:check
```

## Test Fixtures

Reusable fixtures and factories live under `test/fixtures/`. New regression tests should put
shared project readers, tool factories, and data builders there instead of duplicating setup in
individual specs. `test/unit/quality-gates.test.ts` is the canonical regression check for CI,
release, and security script wiring.

## Advanced Quality Gates

Mutation testing is intentionally deferred for v1.0.x. The current choice is to enforce Jest
coverage in CI and add explicit critical-path regression tests around release and security gates.

| Option | Pros | Cons | Fit |
| ------ | ---- | ---- | --- |
| Jest coverage in `ci:check` | Uses the existing runner and lockfile; fast enough for every PR; fails on threshold regressions. | Confirms executed lines, not assertion strength. | High |
| StrykerJS with Jest runner | Exercises assertion strength for selected TypeScript modules and supports Jest test filtering. | Adds several new dev dependencies, extra runtime cost, and ESM/Jest runner tuning. | Medium |
| Playwright E2E | Strong fit for browser/UI flows and cross-browser assertions. | This package is a Node MCP server with no browser UI, so the browser cost is not justified. | Low |

Revisit StrykerJS when either `src/checker.ts`, `src/registry.ts`, or `src/app.ts` changes in a
way where line coverage misses meaningful behavioral risk, or when CI has enough runtime budget
for a nightly mutation job. The first mutation scope should be one critical module with a
published mutation score target before expanding repo-wide.

Security-focused local checks:

```bash
actionlint
zizmor --offline --min-severity low .github/workflows
gitleaks detect --no-git --redact --source .
```
