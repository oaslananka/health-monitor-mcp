# GitHub Actions Monitoring Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure GitHub Actions workflow monitoring that participates in registration, checks, scheduling, batch fan-out, dashboards, and reports.

**Architecture:** Provider-specific API and persistence modules keep GitHub concerns isolated. Existing orchestration consumes a two-kind target union so MCP servers and GitHub workflows share bounded concurrency without migrating the stable MCP server schema.

**Tech Stack:** Node.js 24.18.0, TypeScript 5.8, Zod v3, better-sqlite3, Jest 29, GitHub REST API version 2026-03-10, pnpm 11.14.0.

## Global Constraints

- Store only the GitHub token environment-variable name; never persist or emit token values.
- Fix the API base to `https://api.github.com`.
- Accept only numeric workflow IDs or `.yml`/`.yaml` workflow filenames.
- Apply one `HEALTH_MONITOR_MAX_CONCURRENCY` limit across MCP and GitHub checks.
- Preserve current MCP tool response fields and existing SQLite records.
- Retry only HTTP 429 and 5xx responses, at most once.
- Bound jobs to 100 latest-attempt entries and persist failed steps only.
- Use TDD and commit each independently reviewable task.

---

### Task 1: Define provider schemas and database migration

**Files:**
- Modify: `src/types.ts`
- Modify: `src/migrations.ts`
- Test: `test/unit/types.test.ts`
- Test: `test/unit/migrations.test.ts`

**Interfaces:**
- Produces: `RegisterGitHubActionsSchema`, `CheckGitHubActionsSchema`, `ListGitHubActionsSchema`, `UnregisterGitHubActionsSchema`.
- Produces: `RegisteredGitHubActionsTarget`, `GitHubActionsCheckResult`, `GitHubActionsRunDetails`, and `GitHubActionsJobDiagnostic`.
- Produces migration version 5 with `github_actions_targets` and `github_actions_checks`.

- [ ] **Step 1: Write failing schema tests**

Add tests that accept:

```ts
RegisterGitHubActionsSchema.parse({
  name: 'repo-ci',
  owner: 'oaslananka',
  repository: 'health-monitor-mcp',
  workflow: 'ci.yml',
  token_env: 'GITHUB_TOKEN',
  tags: ['production'],
  check_interval_minutes: 5
});
```

Reject path-like workflows, invalid environment names, control characters, and out-of-range intervals.

- [ ] **Step 2: Write failing migration tests**

Expect migration version 5 and both provider tables with foreign-key cascade behavior and indexes.

- [ ] **Step 3: Run RED tests**

Run:

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js \
  --runTestsByPath test/unit/types.test.ts test/unit/migrations.test.ts
```

Expected: failures for missing schemas, types, migration, and tables.

- [ ] **Step 4: Implement schemas, types, and migration**

Use a token environment regex of `^[A-Z_][A-Z0-9_]*$`, GitHub owner/repository regex of `^[A-Za-z0-9_.-]+$`, and workflow validation of either `^[0-9]+$` or `^[A-Za-z0-9_.-]+\.ya?ml$`.

Migration 5 creates:

```sql
CREATE TABLE github_actions_targets (...);
CREATE TABLE github_actions_checks (...);
CREATE INDEX idx_github_actions_checks_target_time
  ON github_actions_checks(target_name, timestamp DESC);
CREATE INDEX idx_github_actions_checks_timestamp
  ON github_actions_checks(timestamp DESC);
```

- [ ] **Step 5: Run GREEN tests and commit**

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js \
  --runTestsByPath test/unit/types.test.ts test/unit/migrations.test.ts
git add src/types.ts src/migrations.ts test/unit/types.test.ts test/unit/migrations.test.ts
git commit -m "feat(github-actions): add provider schema and storage migration"
```

### Task 2: Build the bounded GitHub Actions API client

**Files:**
- Create: `src/github-actions.ts`
- Create: `test/unit/github-actions.test.ts`

**Interfaces:**
- Consumes: `RegisteredGitHubActionsTarget`, `GitHubActionsCheckResult`.
- Produces: `checkGitHubActionsTarget(target, timeoutMs): Promise<GitHubActionsCheckResult>`.
- Produces: `setGitHubActionsRuntimeForTests()` and `resetGitHubActionsRuntimeForTests()`.

- [ ] **Step 1: Write mocked API tests**

Cover:

```ts
await checkGitHubActionsTarget(target, 5_000);
```

for successful, in-progress, failed-with-jobs, no-run, 401, 403 rate limit, 404, 429 retry, 5xx retry, timeout, malformed run payload, and malformed jobs payload.

Assert headers include:

```ts
Accept: application/vnd.github+json
X-GitHub-Api-Version: 2026-03-10
User-Agent: health-monitor-mcp/<version>
```

Assert `Authorization` exists only when `token_env` resolves to a non-empty secret.

- [ ] **Step 2: Run RED test**

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js \
  --runTestsByPath test/unit/github-actions.test.ts
```

Expected: module and function not found.

- [ ] **Step 3: Implement API request and parsing**

Create an internal `GitHubApiError` containing HTTP status and retryability. Use `fetchWithTimeout` and `withRetry({ attempts: 2, shouldRetry })`. Calculate one remaining timeout budget for both API calls.

Status mapping:

```ts
const successful = new Set(['success', 'neutral', 'skipped']);
const failed = new Set([
  'failure', 'cancelled', 'timed_out', 'action_required', 'startup_failure', 'stale'
]);
```

Fetch jobs only for conclusions in `failed`.

- [ ] **Step 4: Run GREEN test and commit**

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js \
  --runTestsByPath test/unit/github-actions.test.ts
git add src/github-actions.ts test/unit/github-actions.test.ts
git commit -m "feat(github-actions): check workflow runs and failed jobs"
```

### Task 3: Add provider registry and analytics

**Files:**
- Create: `src/github-actions-registry.ts`
- Create: `test/unit/github-actions-registry.test.ts`

**Interfaces:**
- Produces: `registerGitHubActionsTarget`, `unregisterGitHubActionsTarget`, `getGitHubActionsTarget`, `listGitHubActionsTargets`, `recordGitHubActionsCheck`, `getGitHubActionsDashboardReport`, `getLatestGitHubActionsCheck`, and `pruneGitHubActionsChecks`.

- [ ] **Step 1: Write failing CRUD/history tests**

Test upsert, tags, status filters, check persistence, consecutive-failure reset, dashboard uptime/latency, pruning, and target-delete cascade.

- [ ] **Step 2: Run RED test**

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js \
  --runTestsByPath test/unit/github-actions-registry.test.ts
```

- [ ] **Step 3: Implement registry functions**

Serialize tags and failed-job diagnostics as JSON. Never accept a token value argument. Update target latest state in the same transaction as inserting a check.

- [ ] **Step 4: Run GREEN test and commit**

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js \
  --runTestsByPath test/unit/github-actions-registry.test.ts
git add src/github-actions-registry.ts test/unit/github-actions-registry.test.ts
git commit -m "feat(github-actions): persist workflow health history"
```

### Task 4: Expose lifecycle tools and integrate interactive orchestration

**Files:**
- Create: `src/github-actions-tools.ts`
- Modify: `src/app.ts`
- Modify: `test/unit/app.test.ts`
- Modify: `test/integration/health-flow.test.ts`

**Interfaces:**
- Produces: `registerGitHubActionsTools(registrar)`.
- `app.ts` calls the registration helper and includes GitHub tasks in `check_all`, dashboard, report, and monitor stats.

- [ ] **Step 1: Write failing tool tests**

Require exact tools:

```ts
register_github_actions
check_github_actions
list_github_actions
unregister_github_actions
```

Test full lifecycle, missing target, public unauthenticated request, failed diagnostics, tags, and destructive/read-only annotations.

- [ ] **Step 2: Write failing mixed `check_all` and dashboard tests**

Register one MCP server and one GitHub target. Assert one shared result array with `kind`, stable ordering, dashboard `github_actions`, summary counts, report section, and monitor statistics.

- [ ] **Step 3: Run RED tests**

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js \
  --runTestsByPath test/unit/app.test.ts test/integration/health-flow.test.ts
```

- [ ] **Step 4: Implement tools and app integration**

Provider tool responses include `checked_at`, run details, failed jobs, and a concise message. `check_all` uses one task union and one `mapWithConcurrency` call.

- [ ] **Step 5: Run GREEN tests and commit**

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js \
  --runTestsByPath test/unit/app.test.ts test/integration/health-flow.test.ts
git add src/github-actions-tools.ts src/app.ts test/unit/app.test.ts test/integration/health-flow.test.ts
git commit -m "feat(github-actions): expose workflow monitoring tools"
```

### Task 5: Integrate provider scheduling

**Files:**
- Modify: `src/scheduler.ts`
- Modify: `test/unit/scheduler.test.ts`

**Interfaces:**
- Scheduler runtime gains provider list/check/record functions.
- Internal task union is `{ kind: 'mcp_server' | 'github_actions'; name: string; ... }`.

- [ ] **Step 1: Write failing mixed scheduler tests**

Test due filtering for both target kinds, one shared concurrency ceiling, provider check persistence, MCP stdio policy isolation, and provider-specific failure logging.

- [ ] **Step 2: Run RED test**

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js \
  --runTestsByPath test/unit/scheduler.test.ts
```

- [ ] **Step 3: Implement mixed scheduler task execution**

Preserve the existing overlap guard and timer behavior. Log `{ kind, name, status }`.

- [ ] **Step 4: Run GREEN test and commit**

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js \
  --runTestsByPath test/unit/scheduler.test.ts
git add src/scheduler.ts test/unit/scheduler.test.ts
git commit -m "feat(github-actions): schedule workflow monitoring"
```

### Task 6: Update metadata and operator documentation

**Files:**
- Modify: `mcp.json`
- Modify: `server.json`
- Modify: `README.md`
- Modify: `ROADMAP.md`
- Modify: `docs/usage.md`
- Modify: `docs/architecture.md`
- Modify: `docs/operations.md`
- Modify: `docs/security-tooling.md`
- Modify: `CHANGELOG.md`
- Modify: `test/integration/packaged-smoke.test.ts`
- Modify: `test/unit/quality-gates.test.ts`

- [ ] **Step 1: Write failing metadata/package tests**

Require all 14 tool names and environment metadata for optional `GITHUB_TOKEN`. Assert docs state that only `token_env` is persisted and Actions read permission is sufficient.

- [ ] **Step 2: Run RED tests**

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js \
  --runTestsByPath test/integration/packaged-smoke.test.ts test/unit/quality-gates.test.ts
```

- [ ] **Step 3: Update metadata and docs**

Document registration and check examples, private/public auth behavior, rate-limit troubleshooting, scheduler participation, and report fields. Mark GitHub Actions monitoring complete in the roadmap.

- [ ] **Step 4: Run GREEN tests and commit**

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js \
  --runTestsByPath test/integration/packaged-smoke.test.ts test/unit/quality-gates.test.ts
git add mcp.json server.json README.md ROADMAP.md docs CHANGELOG.md test/integration/packaged-smoke.test.ts test/unit/quality-gates.test.ts
git commit -m "docs: document GitHub Actions monitoring"
```

### Task 7: Full verification, PR review, merge, and release validation

**Files:**
- No planned source changes; fix only evidence-backed failures.

- [ ] **Step 1: Run complete local gates**

```bash
export PATH=/tmp/hmm96-verify/bin:$PATH
pnpm install --frozen-lockfile
pnpm run ci
pre-commit run --all-files --hook-stage pre-commit
curl --fail --silent --show-error --data-binary @codecov.yml https://codecov.io/validate
git diff --check
git status --short --branch
```

Expected: all tests, coverage, audit, SBOM, license, REUSE, package, metadata, release dry-run, hooks, and Codecov validation pass.

- [ ] **Step 2: Push and open PR**

```bash
git push -u origin feat/40-github-actions-provider
gh pr create --base main --head feat/40-github-actions-provider \
  --title "feat: add GitHub Actions workflow monitoring" \
  --body-file /tmp/pr-40.md
```

- [ ] **Step 3: Review every automated and human finding**

Inspect Codecov, Docker/Trivy, CodeQL, Semgrep, Snyk, SonarQube Cloud, Socket, DeepScan, dependency review, Renovate, Workflow Security, Repository Policy, Review Thread Gate, comments, reviews, and unresolved threads. Fix all actionable findings and repeat local/remote verification.

- [ ] **Step 4: Squash merge and verify main**

Merge only when the PR is `CLEAN/MERGEABLE` and every required check is successful. Verify the exact merge commit on `main` and close #40 with evidence.

- [ ] **Step 5: Validate the generated v1.2.0 release PR**

Release Please should create `1.2.0` because the merged change is a feature. Review its diff and every bot/agent result, merge when clean, approve npm production deployment, and verify GitHub Release, npm, GHCR, MCP Registry, checksum, SBOM, provenance, and a clean downstream install.

- [ ] **Step 6: Clean temporary branches and worktrees**

Remove the merged feature/release branches and linked worktree only after public release verification succeeds. Leave canonical `main` equal to `origin/main` with a clean status.
