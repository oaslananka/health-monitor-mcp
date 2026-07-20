# Remove Azure DevOps and Consolidate v1.1.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Azure DevOps completely from the active product and ship a single v1.1.0 maintenance PR that also closes #39, #51, #53, #77, and #78.

**Architecture:** Preserve immutable SQLite migration history, then add a final cleanup migration that removes Azure data. Extract a reusable ordered concurrency runner for scheduler and interactive checks. Keep expected tool failures inside deterministic JSON envelopes. Synchronize all release metadata and make every publisher verify one exact component tag and commit.

**Tech Stack:** TypeScript 5.8, Node.js 24.18.0, pnpm 11.0.9, Jest 29, better-sqlite3, MCP TypeScript SDK 1.x, GitHub Actions, Release Please.

## Global Constraints

- One pull request and one merge for all repository changes.
- No replacement CI provider in this PR.
- Delete active Azure implementation, configuration, metadata, tests, and documentation.
- Keep historical migration versions immutable; add a cleanup migration.
- Preserve ordered results and cap active workers with `HEALTH_MONITOR_MAX_CONCURRENCY`.
- Use stable error codes: `SERVER_NOT_FOUND`, `NO_SERVERS_REGISTERED`, `STDIO_DISABLED`, `STDIO_COMMAND_REJECTED`.
- Pin Node 24.18.0 and pnpm 11.0.9 in `.mise.toml`.
- Synchronize version `1.1.0` across package, manifest, MCP metadata, server metadata, and changelog.
- Review all bot/agent comments and required checks before merge.

---

### Task 1: Define the Azure-removal contract

**Files:**

- Modify: `test/unit/app.test.ts`
- Modify: `test/unit/types.test.ts`
- Modify: `test/unit/migrations.test.ts`
- Modify: `test/integration/packaged-smoke.test.ts`
- Delete later: `test/unit/azure-devops.test.ts`

**Interfaces:**

- Consumes: `registerMonitoringTools()`, `runMigrations()`, package metadata.
- Produces: failing tests that require ten supported tools and no Azure tables/tools/config.

- [ ] **Step 1: Add failing tool-list assertions**

Assert the exact tool list:

```ts
expect(toolNames).toEqual([
  'check_all',
  'check_server',
  'get_dashboard',
  'get_monitor_stats',
  'get_report',
  'get_uptime',
  'list_servers',
  'register_server',
  'set_alert',
  'unregister_server'
]);
expect(toolNames.some((name) => name.includes('azure') || name.includes('pipeline'))).toBe(false);
```

- [ ] **Step 2: Add failing migration assertions**

After migrations, assert:

```ts
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
  .all() as Array<{ name: string }>;
expect(tables.map((row) => row.name)).not.toEqual(
  expect.arrayContaining(['azure_pipelines', 'pipeline_runs'])
);
```

Create an upgrade fixture at migration version 3 with both Azure tables populated, run migrations, and assert both tables are removed while `servers`, `health_checks`, and `alerts` remain.

- [ ] **Step 3: Add failing package smoke assertions**

Assert `mcp.json`, `server.json`, README text, and listed tools contain no active Azure capability or `HEALTH_MONITOR_ENCRYPTION_KEY`.

- [ ] **Step 4: Run RED tests**

```bash
pnpm exec jest --runTestsByPath \
  test/unit/app.test.ts \
  test/unit/types.test.ts \
  test/unit/migrations.test.ts \
  test/integration/packaged-smoke.test.ts --runInBand
```

Expected: failures naming Azure tools/tables/metadata.

- [ ] **Step 5: Commit tests**

```bash
git add test/unit/app.test.ts test/unit/types.test.ts test/unit/migrations.test.ts test/integration/packaged-smoke.test.ts
git commit -m "test: define Azure removal contract"
```

### Task 2: Remove Azure implementation and obsolete storage

**Files:**

- Delete: `src/azure-devops.ts`
- Modify: `src/app.ts`
- Modify: `src/types.ts`
- Modify: `src/registry.ts`
- Modify: `src/config.ts`
- Modify: `src/migrations.ts`
- Delete: `test/unit/azure-devops.test.ts`
- Modify: `test/unit/registry.test.ts`
- Modify: `test/unit/app.test.ts`
- Modify: `test/unit/migrations.test.ts`

**Interfaces:**

- Consumes: existing server/health/alert registry functions.
- Produces: migration version 4 and MCP-only monitoring API.

- [ ] **Step 1: Add migration version 4**

Append:

```ts
{
  version: 4,
  description: 'remove retired Azure DevOps monitoring data',
  up: (db) => {
    db.exec(`
      DROP INDEX IF EXISTS idx_pipeline_runs_group_time;
      DROP INDEX IF EXISTS idx_pipeline_runs_build;
      DROP INDEX IF EXISTS idx_pipeline_runs_stable_key;
      DROP TABLE IF EXISTS pipeline_runs;
      DROP TABLE IF EXISTS azure_pipelines;
    `);
  }
}
```

- [ ] **Step 2: Remove Azure types and schemas**

Delete `RegisterAzurePipelineSchema`, `CheckPipelineStatusSchema`, `RegisteredPipelineLogsSchema`, `CheckAllProjectsSchema`, their inferred input types, `PipelineStatus`, `RegisteredAzurePipeline`, and `RecordedPipelineRun`.

- [ ] **Step 3: Remove Azure registry and encryption code**

Delete crypto imports, PAT key helpers, encode/decode functions, Azure row types, pipeline registration/list/read functions, and run recording. Keep only server, health, alert, dashboard, and stats storage.

- [ ] **Step 4: Remove Azure tool handlers**

Delete Azure imports and these registrations from `src/app.ts`:

```text
register_azure_pipelines
check_pipeline_status
get_pipeline_logs
check_all_projects
```

- [ ] **Step 5: Remove Azure timeout configuration**

Delete `getAzureTimeoutMs()` and all tests/references.

- [ ] **Step 6: Delete Azure source/tests/config**

```bash
rm -f src/azure-devops.ts test/unit/azure-devops.test.ts azure-pipelines.yml
rm -rf .azure
```

- [ ] **Step 7: Run focused tests**

```bash
pnpm run typecheck
pnpm run lint
pnpm run lint:test
pnpm exec jest --runTestsByPath \
  test/unit/app.test.ts \
  test/unit/types.test.ts \
  test/unit/registry.test.ts \
  test/unit/migrations.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: remove Azure DevOps monitoring"
```

### Task 3: Share bounded concurrency across scheduler and `check_all`

**Files:**

- Create: `src/concurrency.ts`
- Create: `test/unit/concurrency.test.ts`
- Modify: `src/scheduler.ts`
- Modify: `src/app.ts`
- Modify: `test/unit/scheduler.test.ts`
- Modify: `test/unit/app.test.ts`

**Interfaces:**

- Produces:

```ts
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  maxConcurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<Array<PromiseSettledResult<R>>>;
```

- [ ] **Step 1: Write failing concurrency tests**

Test empty input, input-order preservation, active-worker cap, and continued processing after one rejection.

- [ ] **Step 2: Verify RED**

```bash
pnpm exec jest --runTestsByPath test/unit/concurrency.test.ts --runInBand
```

Expected: module not found.

- [ ] **Step 3: Implement `mapWithConcurrency`**

Use a shared next-index counter and a pre-sized result array. Clamp concurrency to at least 1 and at most item count. Wrap each worker call in `try/catch` and write `{status:'fulfilled', value}` or `{status:'rejected', reason}` at the original index.

- [ ] **Step 4: Replace scheduler-local runner**

Delete private `runWithConcurrency()` and call:

```ts
await mapWithConcurrency(dueServers, getMaxConcurrency(), async (server) => {
  // existing failure-isolated scheduler body
});
```

- [ ] **Step 5: Bound `check_all`**

Use the same helper and return:

```ts
{
  summary,
  checked_at,
  max_concurrency: getMaxConcurrency(),
  queued: Math.max(0, servers.length - getMaxConcurrency()),
  results: checks
}
```

For no registered servers, return `NO_SERVERS_REGISTERED` from Task 4.

- [ ] **Step 6: Run focused tests**

```bash
pnpm exec jest --runTestsByPath \
  test/unit/concurrency.test.ts \
  test/unit/scheduler.test.ts \
  test/unit/app.test.ts --runInBand
```

Expected: PASS and max active count never exceeds configured limit.

- [ ] **Step 7: Commit**

```bash
git add src/concurrency.ts src/scheduler.ts src/app.ts test/unit/concurrency.test.ts test/unit/scheduler.test.ts test/unit/app.test.ts
git commit -m "feat: bound interactive monitoring concurrency"
```

### Task 4: Add stable agent-facing errors and transport guidance

**Files:**

- Create: `src/tool-errors.ts`
- Create: `test/unit/tool-errors.test.ts`
- Modify: `src/app.ts`
- Modify: `src/types.ts`
- Modify: `test/unit/app.test.ts`
- Modify: `test/unit/types.test.ts`
- Modify: `docs/usage.md`

**Interfaces:**

- Produces:

```ts
export type ToolErrorCode =
  | 'SERVER_NOT_FOUND'
  | 'NO_SERVERS_REGISTERED'
  | 'STDIO_DISABLED'
  | 'STDIO_COMMAND_REJECTED';

export function toolError(
  code: ToolErrorCode,
  message: string,
  remediation: string,
  retryable?: boolean
): {
  ok: false;
  error: { code: ToolErrorCode; message: string; remediation: string; retryable: boolean };
};
```

- [ ] **Step 1: Write failing error-envelope tests**

Assert exact JSON for missing server, empty `check_all`, disabled stdio registration, and rejected stdio command.

- [ ] **Step 2: Implement `toolError()`**

Default `retryable` to `false` and keep the output JSON-serializable.

- [ ] **Step 3: Update handlers**

Return structured responses instead of throwing for expected user-correctable failures. Preserve unexpected exception handling.

- [ ] **Step 4: Sharpen descriptions**

Use these concepts in tool/schema descriptions:

```text
http: Streamable HTTP MCP endpoint URL
sse: legacy Server-Sent Events endpoint; use only for older servers
stdio: local executable; requires HEALTH_MONITOR_ALLOW_STDIO=1 and command allowlist compliance
```

- [ ] **Step 5: Add agent-oriented examples**

Document registration, missing-server remediation, filtered batch checks, and stdio opt-in in `docs/usage.md`.

- [ ] **Step 6: Run tests**

```bash
pnpm exec jest --runTestsByPath \
  test/unit/tool-errors.test.ts \
  test/unit/app.test.ts \
  test/unit/types.test.ts --runInBand
pnpm run docs:api:check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/tool-errors.ts src/app.ts src/types.ts test/unit/tool-errors.test.ts test/unit/app.test.ts test/unit/types.test.ts docs/usage.md
git commit -m "feat: standardize agent remediation errors"
```

### Task 5: Align docs, metadata, runtime, skills, and Docker guidance

**Files:**

- Create: `.mise.toml`
- Modify: `README.md`
- Modify: `ROADMAP.md`
- Modify: `docs/architecture.md`
- Modify: `docs/operations.md`
- Modify: `docs/security.md`
- Modify: `docs/release.md`
- Modify: `SECURITY.md`
- Modify: `mcp.json`
- Modify: `server.json`
- Modify: `package.json`
- Modify: `skills/health-monitoring/SKILL.md`
- Modify: `skills/uptime-incident-triage/SKILL.md`
- Modify: `skills/alerting-dashboard/SKILL.md`
- Modify: `AGENTS.md`, `CLAUDE.md`, `CODEX.md`, `GEMINI.md`, `ANTIGRAVITY.md`
- Delete: `docs/adr/0002-encrypted-pat-storage.md`
- Modify: `docs/adr/README.md`
- Delete: Azure-specific Superpowers design/plan documents.

**Interfaces:**

- Consumes: ten-tool product surface and runtime environment variables.
- Produces: current public documentation and metadata.

- [ ] **Step 1: Add runtime pin**

```toml
[tools]
node = "24.18.0"
pnpm = "11.0.9"
```

- [ ] **Step 2: Update package/MCP/server descriptions**

Remove Azure keywords, tools, secrets, and descriptions. Change concurrency descriptions to cover scheduled and interactive checks.

- [ ] **Step 3: Rewrite active docs**

Use MCP-only language, `npx -y health-monitor-mcp`, persistent Docker example:

```bash
docker volume create health-monitor-data
docker run --rm \
  -v health-monitor-data:/data \
  -e HEALTH_MONITOR_HTTP_TOKEN=change-me \
  -e HEALTH_MONITOR_HTTP_ORIGIN_ALLOWLIST=https://client.example \
  -p 3000:3000 \
  ghcr.io/oaslananka/health-monitor-mcp:1.1.0
```

- [ ] **Step 4: Update roadmap**

List active milestones in order with GitHub milestone links and explicitly state Azure support was retired in 1.1.0. Keep GitHub/GitLab/generic HTTP providers as future independent work.

- [ ] **Step 5: Remove active Azure historical design docs**

Delete Azure-only ADR/spec/plan files and remove their indexes. Preserve factual prior release entries in `CHANGELOG.md`.

- [ ] **Step 6: Validate no active references**

```bash
rg -n -i 'azure|devops|pat_token|HEALTH_MONITOR_AZURE|HEALTH_MONITOR_ENCRYPTION_KEY' \
  --glob '!CHANGELOG.md' \
  --glob '!docs/superpowers/specs/2026-07-21-remove-azure-maintenance-release-design.md' \
  --glob '!docs/superpowers/plans/2026-07-21-remove-azure-maintenance-release.md' \
  --glob '!src/migrations.ts' \
  --glob '!node_modules/**' .
```

Expected: only immutable historical migration SQL/descriptions or explicit retirement notes.

- [ ] **Step 7: Validate metadata/docs**

```bash
mise trust
mise x -- node --version
mise x -- pnpm --version
pnpm run format:check
pnpm run check:metadata
pnpm run docs:api:check
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "docs: align MCP-only monitoring release"
```

### Task 6: Harden release orchestration and synchronize 1.1.0

**Files:**

- Create: `scripts/verify-release-ref.mjs`
- Create: `test/unit/release-ref.test.ts`
- Modify: `test/unit/quality-gates.test.ts`
- Modify: `.github/workflows/release.yml`
- Modify: `.github/workflows/publish-npm.yml`
- Modify: `.github/workflows/publish-ghcr.yml`
- Modify: `.github/workflows/publish-mcp-registry.yml`
- Modify: `package.json`
- Modify: `.release-please-manifest.json`
- Modify: `mcp.json`
- Modify: `server.json`
- Modify: `CHANGELOG.md`
- Modify: `docs/release.md`
- Modify: `docs/release-state-machine.md`

**Interfaces:**

- Produces: `pnpm run release:verify-ref -- --tag <tag>`.

- [ ] **Step 1: Port release-ref tests and verifier**

Bring the tested verifier from `fix/77-release-orchestration`. It must compare package/MCP/server/manifest versions, require `health-monitor-mcp-v${version}`, require the tag to exist, and require tag commit equals `HEAD`.

- [ ] **Step 2: Update workflows**

- Release Please uses `token: ${{ secrets.RELEASE_PLEASE_TOKEN }}`.
- Release assets checkout fetches tags and runs `pnpm run release:verify-ref`.
- npm supports `release.published` and manual recovery, checks out the release tag, and retains `npm-production` environment approval.
- MCP Registry is a reusable workflow called by `Publish npm` after successful package verification; it receives and verifies the exact component tag.
- GHCR fetches tags and verifies the release tag before build/push.

- [ ] **Step 3: Set version 1.1.0**

Synchronize all version files and add changelog sections:

```markdown
### Removed

- Removed Azure DevOps pipeline registration, status, log tools, credentials, CI templates, and stored pipeline data.

### Added

- Stable agent remediation errors and shared bounded concurrency.

### Fixed

- Release publication now verifies one exact component tag and commit across npm, GHCR, MCP Registry, and release assets.
```

- [ ] **Step 4: Run release tests**

```bash
pnpm exec jest --runTestsByPath test/unit/release-ref.test.ts test/unit/quality-gates.test.ts --runInBand
pnpm run check:metadata
pnpm run release:dry-run
actionlint
zizmor .github/workflows
```

Expected: PASS; dry-run reports synchronized 1.1.0 and no tag yet.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(release): prepare MCP-only v1.1.0"
```

### Task 7: Full verification, one PR, bot review, merge, and publication

**Files:**

- No new product files unless verification identifies a defect.

- [ ] **Step 1: Run local security and CI gates**

```bash
pre-commit run --all-files --hook-stage pre-commit
pnpm run ci
pnpm run test:integration
pnpm run check:package
git diff --check
```

Expected: all tests, audit, SBOM, license, REUSE, metadata, package, and release dry-run checks pass.

- [ ] **Step 2: Close superseded Release Please PR #85**

Add a comment that the consolidated Azure-removal v1.1.0 PR supersedes it, then close it without merge.

- [ ] **Step 3: Push and open one PR**

PR title:

```text
chore(main): release MCP-only health-monitor-mcp 1.1.0
```

PR body must list Azure removal and `Closes #39`, `Closes #51`, `Closes #53`, `Closes #78`; reference #77 as release verification completed after publication.

- [ ] **Step 4: Review all checks and comments**

Inspect required checks and comments from CI, Semgrep, Snyk, SonarQube Cloud, CodeQL, Socket, dependency review, Renovate, repository policy, and review-thread gate. Resolve every actionable bot/agent finding and rerun checks.

- [ ] **Step 5: Merge**

Merge only when `mergeStateStatus=CLEAN`, all required checks are successful, and no unresolved review threads exist.

- [ ] **Step 6: Publish exact merged commit**

Create `health-monitor-mcp-v1.1.0` and GitHub Release from the merged commit if Release Please does not create them automatically. Trigger/approve npm publication, then verify GHCR and MCP Registry workflows.

- [ ] **Step 7: Verify public surfaces**

```bash
gh release view health-monitor-mcp-v1.1.0
npm view health-monitor-mcp@1.1.0 version dist.integrity --json
gh api repos/oaslananka/health-monitor-mcp/git/ref/tags/health-monitor-mcp-v1.1.0
node scripts/verify-npm-package.mjs
```

Verify release assets include tarball, `SHA256SUMS`, `pack.json`, CycloneDX and SPDX SBOMs; GHCR digest maps to the tag commit; MCP Registry reports `io.github.oaslananka/health-monitor-mcp@1.1.0`.

- [ ] **Step 8: Close #77 and clean branches/worktrees**

Comment with tag, commit, npm integrity, GHCR digest, registry version, checks, and release assets. Close #77 only when every surface verifies. Delete stale release and feature branches and remove temporary worktrees.
