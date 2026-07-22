# Generic HTTP Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure generic HTTP endpoint monitoring with TLS-expiry and bounded response assertions across tools, persistence, scheduling, dashboards, documentation, and release metadata.

**Architecture:** Create a focused HTTP network-policy module, a built-in Node HTTP/HTTPS checker with DNS pinning and manual redirects, provider-specific registry/tools modules, and migration v7. Integrate the provider through the existing shared concurrency paths without storing response bodies or secrets.

**Tech Stack:** TypeScript 5.8, Node.js 24 built-in `dns`, `http`, `https`, `net`, and `tls`, Zod v3, better-sqlite3, Jest 29, TypeDoc, pnpm 11.

## Global Constraints

- GET requests only; no request body, cookies, proxy, or custom authentication headers.
- URL schemes are HTTP or HTTPS; credentials and fragments are forbidden.
- Response body limit is exactly 262144 bytes.
- Redirect limit is exactly 3 and every destination repeats SSRF validation.
- Public-network access is the default.
- Private/non-public addresses require exact-origin `HEALTH_MONITOR_HTTP_TARGET_ALLOWLIST` membership and runtime profile `full`.
- Remote-safe, ChatGPT, and Claude profiles never permit private-network overrides.
- Reject a DNS result set when any resolved address is non-public unless the exact-origin override is active.
- Store response metadata and assertion diagnostics only; never store full bodies or certificate chains.
- Keep one shared `HEALTH_MONITOR_MAX_CONCURRENCY` queue across all providers.
- Version remains 1.3.0 on the feature branch; Release Please owns the next minor release.

---

### Task 1: HTTP Schemas and Migration v7

**Files:**
- Modify: `src/types.ts`
- Modify: `src/migrations.ts`
- Modify: `test/unit/types.test.ts`
- Modify: `test/unit/migrations.test.ts`

**Interfaces:**
- Produces: `RegisterHttpTargetSchema`, `CheckHttpTargetSchema`, `ListHttpTargetsSchema`, `UnregisterHttpTargetSchema`
- Produces: `RegisterHttpTargetInput`, `CheckHttpTargetInput`, `ListHttpTargetsInput`, `UnregisterHttpTargetInput`
- Produces: `RegisteredHttpTarget`, `HttpCheckResult`, `HttpCheckRecord`, `HttpAssertionDiagnostic`, `HttpTlsDetails`, `HttpResponseDetails`

- [ ] **Step 1: Write failing schema tests**

Add tests that parse a minimal target and assert defaults:

```ts
const parsed = RegisterHttpTargetSchema.parse({
  name: 'public-health',
  url: 'https://example.com/health'
});

expect(parsed).toEqual(
  expect.objectContaining({
    expected_statuses: [200],
    header_assertions: [],
    body_contains: [],
    json_assertions: [],
    check_interval_minutes: 5
  })
);
```

Add rejected inputs for credentials, fragments, non-HTTP schemes, more than 20 statuses, more than 10 header assertions, more than 5 body substrings, unsafe JSON paths, and `tls_expiry_days` on HTTP.

- [ ] **Step 2: Write failing migration tests**

Expect migration version 7 with description `add generic HTTP monitoring provider`, then insert/delete one `http_targets` row and verify `http_checks` cascades.

- [ ] **Step 3: Run RED tests**

Run:

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js \
  --runTestsByPath test/unit/types.test.ts test/unit/migrations.test.ts
```

Expected: missing exports and missing tables.

- [ ] **Step 4: Implement schemas and types**

Use these exact public shapes:

```ts
export interface HttpHeaderAssertion {
  name: string;
  equals: string;
}

export interface HttpJsonAssertion {
  path: string;
  equals: string | number | boolean | null;
}

export interface HttpAssertionDiagnostic {
  type: 'status' | 'header' | 'body_contains' | 'json_equals' | 'tls_expiry';
  passed: boolean;
  path: string | null;
  expected: string | number | boolean | null;
  actual: string | number | boolean | null;
  message: string;
}

export interface HttpTlsDetails {
  subject_cn: string | null;
  issuer_cn: string | null;
  valid_from: string;
  valid_to: string;
  days_remaining: number;
}

export interface HttpResponseDetails {
  status_code: number;
  final_url: string;
  redirect_count: number;
  content_type: string | null;
  content_length: number | null;
  tls: HttpTlsDetails | null;
}

export interface HttpCheckResult {
  status: HealthStatus;
  response_time_ms: number | null;
  error_message: string | null;
  response: HttpResponseDetails | null;
  assertions: HttpAssertionDiagnostic[];
}
```

`RegisterHttpTargetSchema` fields are `name`, `url`, `expected_statuses`, `header_assertions`, `body_contains`, `json_assertions`, `tls_expiry_days`, `tags`, and `check_interval_minutes`. Add a `superRefine` rule that rejects `tls_expiry_days` unless the parsed protocol is HTTPS.

- [ ] **Step 5: Add migration v7**

Create `http_targets` and `http_checks` with foreign-key cascade, indexes on check target/timestamp, JSON text fields for assertions/configuration, latest status/response/TLS fields, and no response body column.

- [ ] **Step 6: Run GREEN tests and static gates**

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js \
  --runTestsByPath test/unit/types.test.ts test/unit/migrations.test.ts
pnpm run typecheck
pnpm run lint
pnpm run lint:test
```

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/migrations.ts test/unit/types.test.ts test/unit/migrations.test.ts
git commit -m "feat(http): add provider schema and storage migration"
```

### Task 2: SSRF Policy and DNS Pinning

**Files:**
- Create: `src/http-target-policy.ts`
- Create: `test/unit/http-target-policy.test.ts`

**Interfaces:**
- Produces: `normalizeHttpTargetUrl(value: string): string`
- Produces: `resolveHttpTarget(url: string, profile: RuntimeProfile): Promise<ResolvedHttpTarget>`
- Produces: `assertHttpTargetUrlAllowed(url: string, profile: RuntimeProfile): Promise<ResolvedHttpTarget>`
- Produces: `isPublicIpAddress(address: string): boolean`
- Produces: test runtime injection helpers for DNS lookup

`ResolvedHttpTarget` contains normalized `url`, `origin`, `hostname`, `port`, `addresses`, and deterministic `selectedAddress`.

- [ ] **Step 1: Write RED policy tests**

Cover:

- HTTP/HTTPS normalization and default-port removal.
- Credentials, fragments, invalid schemes, and empty host rejection.
- IPv4 loopback/private/link-local/CGNAT/documentation/benchmark/multicast/reserved rejection.
- IPv6 unspecified/loopback/ULA/link-local/multicast/documentation and IPv4-mapped private rejection.
- `localhost`, `.localhost`, `.local`, `.internal`, and `.home.arpa` blocked suffixes.
- mixed public/private DNS answers rejected.
- exact origin allowlist permits private resolution in `full` only.
- remote-safe profiles reject the same allowlisted private target.

- [ ] **Step 2: Run RED test**

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js \
  --runTestsByPath test/unit/http-target-policy.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement URL normalization and allowlist parsing**

Normalize origins using `new URL()`. Parse `HEALTH_MONITOR_HTTP_TARGET_ALLOWLIST` as comma-separated normalized origins. Invalid allowlist entries are ignored rather than weakening policy.

- [ ] **Step 4: Implement IP classification**

Use `net.isIP()`, explicit IPv4 integer masks, and normalized IPv6 hextets. Treat all non-global ranges listed in the design as blocked. Detect IPv4-mapped IPv6 and classify the embedded IPv4 address.

- [ ] **Step 5: Implement resolver runtime**

Default to:

```ts
lookup(hostname, { all: true, verbatim: true })
```

Deduplicate answers, reject empty results, sort deterministically by family then address, and select the first validated address. Reject the entire set when any answer is non-public without an active override.

- [ ] **Step 6: Run GREEN and static gates**

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js \
  --runTestsByPath test/unit/http-target-policy.test.ts
pnpm run typecheck
pnpm run lint
pnpm run lint:test
```

- [ ] **Step 7: Commit**

```bash
git add src/http-target-policy.ts test/unit/http-target-policy.test.ts
git commit -m "feat(http): enforce SSRF and DNS policy"
```

### Task 3: Bounded HTTP/TLS Checker and Assertions

**Files:**
- Create: `src/http-targets.ts`
- Create: `test/unit/http-targets.test.ts`

**Interfaces:**
- Consumes: `assertHttpTargetUrlAllowed()` and `ResolvedHttpTarget`
- Produces: `checkHttpTarget(target: RegisteredHttpTarget, timeoutMs: number, options: { profile: RuntimeProfile }): Promise<HttpCheckResult>`
- Produces: checker runtime injection helpers for request clock and policy resolver

- [ ] **Step 1: Write RED checker tests**

Use local HTTP servers and injected resolution to cover:

- passing status/header/body/JSON assertions;
- structured failed assertions causing `down`;
- malformed JSON required by a JSON assertion causing `error`;
- response body over 262144 bytes causing `error`;
- one and three redirects succeeding;
- fourth redirect rejected;
- redirect destination policy rejection;
- total timeout returning `timeout`;
- connection failure returning `error`;
- HTTPS certificate details and expiry assertion using a local test certificate;
- TLS expiry threshold failure causing `down`;
- invalid TLS certificate causing `error`;
- response result excludes the full body.

- [ ] **Step 2: Run RED test**

Expected: module not found.

- [ ] **Step 3: Implement pinned request transport**

Use `http.request` or `https.request` with:

```ts
lookup: (_hostname, _options, callback) => {
  callback(null, resolved.selectedAddress, resolved.family);
}
```

Set `Host` implicitly from the URL and `servername` to the original HTTPS hostname. Do not disable certificate verification.

- [ ] **Step 4: Implement total timeout and body cap**

Calculate remaining budget before DNS and every redirect. Destroy the request on timeout or when accumulated bytes exceed 262144. Return no body outside the internal assertion evaluator.

- [ ] **Step 5: Implement manual redirects**

Recognize 301, 302, 303, 307, and 308 with a `Location` header. Resolve relative locations, cap at three, and call the SSRF resolver again for every destination.

- [ ] **Step 6: Implement assertion evaluation**

Produce one diagnostic per configured assertion. For JSON traversal, split dot paths, permit array decimal indexes, use `Object.prototype.hasOwnProperty.call`, and reject prototype-related segments at schema validation.

- [ ] **Step 7: Implement TLS metadata**

Read the peer certificate from the HTTPS socket. Parse `valid_from` and `valid_to`, calculate floor days remaining, and attach one TLS-expiry diagnostic when configured.

- [ ] **Step 8: Run GREEN and static gates**

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js \
  --runTestsByPath test/unit/http-targets.test.ts
pnpm run typecheck
pnpm run lint
pnpm run lint:test
```

- [ ] **Step 9: Commit**

```bash
git add src/http-targets.ts test/unit/http-targets.test.ts
git commit -m "feat(http): check endpoints and TLS assertions"
```

### Task 4: Registry, History, Retention, and Dashboard

**Files:**
- Create: `src/http-target-registry.ts`
- Create: `test/unit/http-target-registry.test.ts`

**Interfaces:**
- Produces: `registerHttpTarget`, `unregisterHttpTarget`, `getHttpTarget`, `listHttpTargets`, `recordHttpCheck`, `getLatestHttpCheck`, `pruneHttpChecks`, `getHttpDashboardReport`

- [ ] **Step 1: Write RED registry tests**

Test create/update/list/filter/delete, serialized assertion config, check history, consecutive failure reset, TLS latest summary, retention pruning, cascade deletion, and dashboard uptime/latency/failed assertion aggregation.

- [ ] **Step 2: Run RED test**

Expected: module not found.

- [ ] **Step 3: Implement mappings and CRUD**

Serialize config arrays as JSON. Map DB rows back to typed arrays defensively. Do not add any body, cookie, or header-secret field.

- [ ] **Step 4: Implement check recording**

Store response summary and assertion diagnostics. Update latest status, status code, final URL, TLS days, failed assertion count, and consecutive failures in one transaction.

- [ ] **Step 5: Implement retention and dashboard**

Use the existing 1000-row bounded prune query and aggregate checks within the requested hour window.

- [ ] **Step 6: Run GREEN and static gates**

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js \
  --runTestsByPath test/unit/http-target-registry.test.ts
pnpm run typecheck
pnpm run lint
pnpm run lint:test
```

- [ ] **Step 7: Commit**

```bash
git add src/http-target-registry.ts test/unit/http-target-registry.test.ts
git commit -m "feat(http): persist endpoint health history"
```

### Task 5: Public Tools and App Integration

**Files:**
- Create: `src/http-target-tools.ts`
- Modify: `src/tool-errors.ts`
- Modify: `src/app.ts`
- Modify: `test/unit/tool-errors.test.ts`
- Modify: `test/unit/app.test.ts`

**Interfaces:**
- Produces four MCP tools named exactly `register_http_target`, `check_http_target`, `list_http_targets`, and `unregister_http_target`
- Adds error codes `HTTP_TARGET_NOT_FOUND` and `HTTP_TARGET_URL_NOT_ALLOWED`

- [ ] **Step 1: Write RED app/tool tests**

Expect 22 public tools. Test blocked private registration in remote-safe profile, allowed exact-origin registration in full profile with mocked DNS, missing-target remediation, successful check/list/remove, and HTTP inclusion in `check_all`, dashboard, report, and monitor statistics.

- [ ] **Step 2: Run RED tests**

Expected: four missing tools and missing error codes.

- [ ] **Step 3: Implement tool registration**

Pass the active `RuntimePolicy` to the tool module. Registration performs an immediate policy/DNS validation before persistence. Check performs the same validation through the checker and records the result.

- [ ] **Step 4: Extend app orchestration**

Add HTTP targets after GitLab targets in deterministic order. Extend error-result mapping, dashboard JSON, Markdown report section, summary counts, and `get_monitor_stats` queries.

- [ ] **Step 5: Run GREEN and static gates**

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js \
  --runTestsByPath test/unit/app.test.ts test/unit/tool-errors.test.ts
pnpm run typecheck
pnpm run lint
pnpm run lint:test
```

- [ ] **Step 6: Commit**

```bash
git add src/http-target-tools.ts src/tool-errors.ts src/app.ts \
  test/unit/tool-errors.test.ts test/unit/app.test.ts
git commit -m "feat(http): expose endpoint monitoring tools"
```

### Task 6: Scheduler Integration

**Files:**
- Modify: `src/scheduler.ts`
- Modify: `test/unit/scheduler.test.ts`

**Interfaces:**
- Consumes provider registry/check functions.
- Preserves one `mapWithConcurrency` queue across MCP, GitHub Actions, GitLab, and HTTP targets.

- [ ] **Step 1: Write RED scheduler tests**

Add due/fresh HTTP targets and assert provider-specific recording. Extend the shared concurrency test to two targets of each of four kinds while keeping maximum active workers equal to two.

- [ ] **Step 2: Run RED test**

Expected: HTTP checker is never called.

- [ ] **Step 3: Add HTTP scheduled target union**

Pass scheduler runtime profile into `checkHttpTarget`. Log `kind: 'http_target'`. Preserve error isolation and due-time calculation.

- [ ] **Step 4: Run GREEN and static gates**

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js \
  --runTestsByPath test/unit/scheduler.test.ts
pnpm run typecheck
pnpm run lint
pnpm run lint:test
```

- [ ] **Step 5: Commit**

```bash
git add src/scheduler.ts test/unit/scheduler.test.ts
git commit -m "feat(http): schedule endpoint monitoring"
```

### Task 7: Documentation, Metadata, and Integration Flow

**Files:**
- Modify: `README.md`
- Modify: `docs/usage.md`
- Modify: `docs/architecture.md`
- Modify: `docs/operations.md`
- Modify: `docs/security-tooling.md`
- Modify: `ROADMAP.md`
- Modify: `CHANGELOG.md`
- Modify: `mcp.json`
- Modify: `server.json`
- Modify: `package.json` description only when needed; do not change version
- Modify: `test/unit/quality-gates.test.ts`
- Modify: `test/integration/packaged-smoke.test.ts`
- Create: `test/integration/http-target-flow.test.ts`
- Regenerate: `docs/api/**`

- [ ] **Step 1: Write RED metadata tests**

Expect 22 tools, `HEALTH_MONITOR_HTTP_TARGET_ALLOWLIST` metadata, SSRF documentation, 256 KiB body cap, redirect revalidation text, and no stored response body claims.

- [ ] **Step 2: Write RED integration test**

Start a local HTTP server, inject allowlisted full-profile DNS resolution, register/check/list/report/remove through tool handlers, and assert structured status/header/body/JSON diagnostics.

- [ ] **Step 3: Run RED tests**

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js \
  --runTestsByPath test/unit/quality-gates.test.ts \
  test/integration/packaged-smoke.test.ts test/integration/http-target-flow.test.ts
```

- [ ] **Step 4: Update metadata and docs**

Document exact environment variable and profile behavior. Update tool tables and cross-provider ordering. Mark GitLab complete and generic HTTP complete in the multi-provider roadmap, and shift live milestone names to v1.4.0/v1.5.0 after merge planning.

- [ ] **Step 5: Regenerate API docs and validate metadata**

```bash
pnpm run docs:api
pnpm run docs:api:check
pnpm run check:metadata
```

- [ ] **Step 6: Run GREEN tests and static gates**

Run the three focused test files, typecheck, source/test lint, and formatting.

- [ ] **Step 7: Commit**

```bash
git add README.md docs ROADMAP.md CHANGELOG.md mcp.json server.json package.json \
  test/unit/quality-gates.test.ts test/integration/packaged-smoke.test.ts \
  test/integration/http-target-flow.test.ts
git commit -m "docs: document generic HTTP monitoring"
```

### Task 8: Final Verification, PR, Bot Review, and Merge

**Files:**
- No planned source files; only fixes discovered by verification or review.

- [ ] **Step 1: Run exact-head full local verification**

```bash
pnpm install --frozen-lockfile
pnpm run ci
pre-commit run --all-files --hook-stage pre-commit
curl --fail --data-binary @codecov.yml https://codecov.io/validate
git diff --check
git status --short --branch
```

Expected: all tests pass, audit has zero moderate-or-higher vulnerabilities, REUSE is compliant, consumer package audit is zero, all hooks pass, Codecov says `Valid!`, and the tree is clean.

- [ ] **Step 2: Run live public endpoint smoke**

Use the built checker against `https://example.com/` with status 200 and a bounded body substring assertion. Record status, response time, final URL, and TLS days without printing the body.

- [ ] **Step 3: Push and create PR**

PR title:

```text
feat: add generic HTTP and TLS monitoring
```

PR body must include SSRF boundaries, exact head, focused/full validation, live smoke, and `Closes #42`.

- [ ] **Step 4: Inspect every bot and agent result**

Review checks and comments from Codecov, Trivy, CodeQL, Semgrep, Snyk, SonarQube Cloud, Socket, DeepScan, Renovate, dependency review, workflow security, and review-thread gate. Query Sonar findings directly and fix valid issues. Confirm no unresolved review thread or review request remains.

- [ ] **Step 5: Merge and release**

Squash merge only after local exact-head verification and all required/optional security checks pass. Inspect Release Please’s minor-release PR, all bot comments, and release metadata before merging it. Verify npm, GitHub Release assets/checksum/SLSA, GHCR digest/SPDX/SLSA, MCP Registry latest record, and a clean installed package smoke.

- [ ] **Step 6: Close evidence and cleanup**

Comment release evidence on #42, remove stale labels, align milestone titles with the shipped version, delete merged worktrees/branches, and leave canonical `main` clean and synchronized.
