# GitLab Pipeline Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure GitLab.com and allowlisted self-hosted GitLab CI/CD pipeline monitoring with failed job trace diagnostics across all monitor surfaces.

**Architecture:** Implement provider-specific type/schema, API, registry, and tool modules that mirror the GitHub Actions provider boundaries. Integrate GitLab targets into existing app and scheduler orchestration without a generic provider framework refactor.

**Tech Stack:** TypeScript 5.8, Node.js 24.18.0 fetch/Web Streams, Zod v3, better-sqlite3, Jest 29, GitLab REST API v4.

## Global Constraints

- Token values remain environment-only; persist only `token_env`.
- GitLab.com is allowed by default; self-hosted origins require HTTPS and exact `HEALTH_MONITOR_GITLAB_BASE_URL_ALLOWLIST` membership.
- One total request timeout budget and at most one retry for 429/5xx.
- JSON <= 1 MB, jobs <= 100 parsed/20 returned, trace <= 64 KiB read/8,192 characters returned.
- MCP, GitHub, and GitLab targets share one ordered bounded-concurrency queue.
- Use TDD for every behavior change and commit each independently testable slice.

---

### Task 1: Schemas, policy, and migration

**Files:**
- Modify: `src/types.ts`
- Modify: `src/config.ts`
- Modify: `src/migrations.ts`
- Test: `test/unit/types.test.ts`
- Test: `test/unit/migrations.test.ts`
- Test: `test/unit/config.test.ts`

**Interfaces:**
- Produces `RegisterGitLabPipelineInput`, `CheckGitLabPipelineInput`, `ListGitLabPipelinesInput`, `UnregisterGitLabPipelineInput`.
- Produces `RegisteredGitLabPipelineTarget`, `GitLabPipelineCheckResult`, pipeline/job diagnostic interfaces.
- Produces `getGitLabBaseUrlAllowlist(): Set<string>`.

- [ ] Write failing schema tests for GitLab.com defaults, project/ref/token fields, invalid origins, and self-hosted allowlist normalization.
- [ ] Run focused tests and verify missing exports/migration v6 failures.
- [ ] Add minimal schemas/types/config helper and migration v6 tables/indexes.
- [ ] Run focused tests, typecheck, and lint.
- [ ] Commit `feat(gitlab): add provider schema and storage migration`.

### Task 2: GitLab REST API client and trace bounds

**Files:**
- Create: `src/gitlab-pipelines.ts`
- Test: `test/unit/gitlab-pipelines.test.ts`

**Interfaces:**
- Produces `checkGitLabPipelineTarget(target, timeoutMs): Promise<GitLabPipelineCheckResult>`.
- Produces test runtime setters/resetters.

- [ ] Write failing tests for public success, token header, ref encoding, failed pipeline jobs, trace sanitization, nonterminal states, unknown states, no pipelines, malformed JSON, 401/403/404, 429/5xx retry, and timeout.
- [ ] Run focused test and verify the module is missing.
- [ ] Implement bounded API requests, status mapping, job diagnostics, and trace excerpts.
- [ ] Run focused tests, typecheck, source/test lint.
- [ ] Commit `feat(gitlab): check pipelines and failed job traces`.

### Task 3: Provider registry and history

**Files:**
- Create: `src/gitlab-pipeline-registry.ts`
- Test: `test/unit/gitlab-pipeline-registry.test.ts`

**Interfaces:**
- Produces register/get/list/unregister/record/latest/prune/dashboard functions.

- [ ] Write failing CRUD, token non-persistence, history, cascade, retention, filtering, and dashboard tests.
- [ ] Run focused tests and verify the module is missing.
- [ ] Implement SQLite registry/history functions and stable JSON parsing.
- [ ] Run focused tests, typecheck, and lint.
- [ ] Commit `feat(gitlab): persist pipeline health history`.

### Task 4: Public tools and app integration

**Files:**
- Create: `src/gitlab-pipeline-tools.ts`
- Modify: `src/tool-errors.ts`
- Modify: `src/app.ts`
- Test: `test/unit/tool-errors.test.ts`
- Test: `test/unit/app.test.ts`
- Test: `test/integration/health-flow.test.ts`

**Interfaces:**
- Produces four public GitLab tools.
- Extends `check_all`, dashboard, Markdown report, and monitor stats.

- [ ] Write failing tool-registration/lifecycle tests and all-provider ordering assertions.
- [ ] Verify RED for missing tools/error codes.
- [ ] Implement tools and app integrations with backward-compatible existing fields.
- [ ] Run focused tests, typecheck, and lint.
- [ ] Commit `feat(gitlab): expose pipeline monitoring tools`.

### Task 5: Shared scheduler integration

**Files:**
- Modify: `src/scheduler.ts`
- Test: `test/unit/scheduler.test.ts`

- [ ] Write failing tests for due GitLab targets and one shared concurrency cap across MCP/GitHub/GitLab.
- [ ] Verify RED.
- [ ] Add GitLab to scheduler runtime and target union.
- [ ] Run scheduler tests, typecheck, and lint.
- [ ] Commit `feat(gitlab): schedule pipeline monitoring`.

### Task 6: Metadata, docs, roadmap, and API reference

**Files:**
- Modify: `mcp.json`
- Modify: `server.json`
- Modify: `README.md`
- Modify: `docs/usage.md`
- Modify: `docs/architecture.md`
- Modify: `docs/operations.md`
- Modify: `docs/security-tooling.md`
- Modify: `ROADMAP.md`
- Modify: `CHANGELOG.md`
- Modify: `test/integration/packaged-smoke.test.ts`
- Modify: `test/unit/quality-gates.test.ts`
- Generate: `docs/api/**`

- [ ] Write failing package/metadata/documentation regression tests.
- [ ] Update tool/env metadata and operator documentation, including allowlist and token policy.
- [ ] Generate TypeDoc and verify idempotence.
- [ ] Run metadata/package tests, typecheck, and lint.
- [ ] Commit `docs: document GitLab pipeline monitoring` and generated API docs.

### Task 7: Full verification, PR, bot review, release, and cleanup

- [ ] Run `pnpm run ci`.
- [ ] Run all pre-commit hooks, Codecov validator, and `git diff --check`.
- [ ] Perform a self-review for secret leakage, URL construction, response bounds, status mapping, and migration compatibility.
- [ ] Push and open a PR closing #41.
- [ ] Inspect and resolve every Codecov, Trivy, CodeQL, Semgrep, Snyk, SonarQube, Socket, DeepScan, dependency-review, workflow-security, Renovate, and review-thread finding/comment.
- [ ] Squash merge only when all required and advisory checks are clean.
- [ ] Rename public milestones so the feature release is v1.3.0 and observability is v1.4.0.
- [ ] Review and merge the Release Please PR after all bot/agent checks pass.
- [ ] Approve production publication, verify npm/GHCR/GitHub Release/MCP Registry/SBOM/provenance, and run a clean downstream live GitLab smoke when a public fixture is available.
- [ ] Close #41 with evidence, remove stale labels, branches, and worktrees, and leave canonical main clean.
