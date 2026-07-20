# Azure DevOps Log URL Trust Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent Azure PAT authorization from being sent to untrusted timeline log URLs while preserving valid Azure DevOps build-log retrieval.

**Architecture:** Centralize Azure URL construction, validate organization-specific build-log URLs before authentication, and handle redirects manually with a bounded same-origin policy. Security-policy errors are stable, redacted, and non-retryable.

**Tech Stack:** TypeScript, Node.js Fetch API, Jest, pnpm, pre-commit.

## Global Constraints

- Public Azure helper signatures remain unchanged.
- Only HTTPS Azure DevOps build-log endpoints receive authorization.
- Cross-origin redirects never receive authorization.
- No PAT, Basic header, or untrusted URL appears in diagnostics.
- Tests are written and observed failing before production changes.

---

### Task 1: Define URL construction and trust-policy regression tests

**Files:**
- Modify: `test/unit/azure-devops.test.ts`

**Interfaces:**
- Consumes: existing `listPipelines`, `getLatestRun`, and `getPipelineLogs` exports.
- Produces: failing tests for encoded identifiers, trusted log origins, rejected URLs, redirects, and redaction.

- [ ] Add a test asserting organization/project path values and query parameters are encoded.
- [ ] Add table-driven tests for malformed, HTTP, user-info, and hostile-host timeline log URLs.
- [ ] Add successful modern and legacy Azure log URL tests.
- [ ] Add same-origin and cross-origin redirect tests that inspect authorization headers and request counts.
- [ ] Add redirect-limit, missing-location, and redacted-diagnostic tests.
- [ ] Run the focused suite and confirm failures are caused by missing trust-boundary behavior.
- [ ] Commit the failing tests.

### Task 2: Implement encoded Azure URL construction

**Files:**
- Modify: `src/azure-devops.ts`
- Test: `test/unit/azure-devops.test.ts`

**Interfaces:**
- Produces: private `buildAzureProjectUrl(org, project, pathSegments, query)` returning a URL string.

- [ ] Add an encoded path/query URL builder using `encodeURIComponent` and `URLSearchParams`.
- [ ] Route pipeline list, latest build, timeline, and build-result URL construction through the helper.
- [ ] Run focused tests and confirm encoding tests pass.
- [ ] Commit the URL-construction change.

### Task 3: Implement trusted build-log validation

**Files:**
- Modify: `src/azure-devops.ts`
- Test: `test/unit/azure-devops.test.ts`

**Interfaces:**
- Produces: private `AzureLogSecurityError` and `validateAzureBuildLogUrl(logUrl, org, project, buildId)`.

- [ ] Parse URLs and return `malformed-url` for invalid values.
- [ ] Require HTTPS and reject user-info.
- [ ] Accept only modern `dev.azure.com` or organization-scoped legacy Visual Studio origins.
- [ ] Decode and compare the expected organization, project, build, log endpoint path.
- [ ] Mark security-policy errors non-retryable.
- [ ] Run focused tests and confirm URL rejection/acceptance coverage passes.
- [ ] Commit the validation change.

### Task 4: Implement bounded manual redirects and redacted diagnostics

**Files:**
- Modify: `src/azure-devops.ts`
- Test: `test/unit/azure-devops.test.ts`

**Interfaces:**
- `fetchAzureLogText(logUrl, authHeader, org, project, buildId)` validates every request target and follows at most three same-origin redirects.

- [ ] Set `redirect: 'manual'` on authenticated log requests.
- [ ] Handle redirect statuses, missing locations, relative destinations, origin comparison, and redirect limit.
- [ ] Reject cross-origin redirects before a second fetch.
- [ ] Log only step name and stable security code.
- [ ] Return a step-local rejected diagnostic for policy errors and a generic failed diagnostic for other errors.
- [ ] Run focused tests and confirm redirect/redaction behavior passes.
- [ ] Commit the redirect and diagnostics change.

### Task 5: Complete repository validation and PR

**Files:**
- Modify only if validation requires formatting fixes.

- [ ] Run focused Azure tests.
- [ ] Run pre-commit for all files.
- [ ] Run `pnpm run ci` with REUSE available.
- [ ] Run actionlint and zizmor.
- [ ] Push the branch and open a PR closing #75.
- [ ] Inspect CI, bot comments, automated reviews, and security gates.
- [ ] Fix any finding, merge only when every required check passes, then close #75 and clean the worktree.
