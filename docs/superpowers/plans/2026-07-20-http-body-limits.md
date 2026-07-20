# HTTP Request Body Limits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bound HTTP MCP request body memory and time while returning consistent JSON-RPC errors.

**Architecture:** Introduce configurable byte/time limits, a listener-safe body reader with typed errors, and a shared error responder for stateful and stateless POST requests. Oversized and timed-out connections are closed after a 413/408 response.

**Tech Stack:** Node.js HTTP, TypeScript, Jest, pnpm, pre-commit.

## Global Constraints

- Default body limit remains exactly 1048576 bytes.
- Default body timeout is 15000 ms.
- Existing public MCP endpoint and authentication behavior remains unchanged.
- Stateful and stateless body errors use the same JSON-RPC envelope.
- Tests are observed failing before production code changes.

---

### Task 1: Add failing body-resource tests

**Files:**
- Modify: `test/unit/server-http.test.ts`

- [ ] Add raw HTTP helpers for header-only, chunked, slow, and aborted requests.
- [ ] Test exact-limit requests are not rejected as oversized.
- [ ] Test oversized Content-Length returns 413 before body transmission.
- [ ] Test a chunked request gets 413 before all chunks are sent and the connection closes.
- [ ] Test an incomplete request gets 408 within the configured timeout.
- [ ] Test an aborted request never creates a monitor and the server remains healthy.
- [ ] Test stateful/stateless 400, 408, and 413 responses share JSON-RPC structure.
- [ ] Run the focused suite and record expected failures.
- [ ] Commit the failing tests.

### Task 2: Add configuration and typed body errors

**Files:**
- Modify: `src/server-http.ts`
- Modify: `docs/operations.md`
- Test: `test/unit/server-http.test.ts`

- [ ] Add option/env resolution for body bytes and timeout.
- [ ] Add `RequestBodyError` and stable error codes.
- [ ] Add Content-Length parsing and early limit rejection.
- [ ] Document application and reverse-proxy limits.
- [ ] Run focused configuration/early-rejection tests.
- [ ] Commit the configuration change.

### Task 3: Implement bounded body reading

**Files:**
- Create: `src/http-body.ts`
- Modify: `src/server-http.ts`
- Test: `test/unit/server-http.test.ts`

- [ ] Install named data/end/error/aborted listeners and a body timer.
- [ ] Clear listeners, timer, and retained chunks exactly once on settlement.
- [ ] Switch oversized/timed-out requests to discard mode.
- [ ] Reject malformed JSON and client aborts with typed errors.
- [ ] Run exact-limit, chunked, slow, abort, and malformed tests.
- [ ] Commit the body reader change.

### Task 4: Unify HTTP MCP body errors

**Files:**
- Modify: `src/server-http.ts`
- Test: `test/unit/server-http.test.ts`

- [ ] Add a shared JSON-RPC body-error responder.
- [ ] Return 413/-32001, 408/-32002, and 400/-32700 in both modes.
- [ ] Set `Connection: close` for 413 and 408.
- [ ] Avoid writing a response after client abort.
- [ ] Set `server.requestTimeout` from the configured body timeout.
- [ ] Run the complete focused suite.
- [ ] Commit the response integration.

### Task 5: Validate, review, and merge

- [ ] Run pre-commit on all files.
- [ ] Run full `pnpm run ci` with REUSE installed.
- [ ] Run actionlint and zizmor.
- [ ] Push and open a PR closing #76.
- [ ] Inspect CI, bot comments, automated reviews, and security gates.
- [ ] Fix all findings, merge only on a clean check set, close #76, and clean the worktree.
