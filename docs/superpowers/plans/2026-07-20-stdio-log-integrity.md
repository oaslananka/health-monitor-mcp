# MCP Stdio Log Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure every structured runtime log is written to stderr so the MCP stdio stdout stream contains protocol messages only, while preserving `--version` output on stdout.

**Architecture:** Keep the existing shared logger as the single stream-routing boundary. Change only the unsafe `debug`/`info` default branch from `console.log` to `console.error`, retain existing JSON serialization and redaction, and add unit plus packaged-process regression coverage.

**Tech Stack:** TypeScript, Node.js 24, Jest with ts-jest ESM, pnpm 11, MCP TypeScript SDK v1.x.

## Global Constraints

- Do not add a logging dependency or a new public logger API.
- Preserve the structured JSON payload fields: `timestamp`, `level`, `message`, and `context`.
- Preserve recursive secret redaction and Error serialization.
- Preserve `warn` through `console.warn` and `error` through `console.error`.
- Route `debug` and `info` through stderr, never stdout.
- Preserve `node dist/mcp.js --version` as exact `MONITOR_VERSION` stdout output.
- Do not change scheduler timing, concurrency, transport lifecycle, or MCP protocol messages.
- Use test-first red-green-refactor for every production behavior change.

---

### Task 1: Lock the logger stream contract with failing unit tests

**Files:**
- Modify: `test/unit/logging.test.ts`
- Test: `test/unit/logging.test.ts`

**Interfaces:**
- Consumes: `log(level: 'debug' | 'info' | 'warn' | 'error', message: string, context?: Record<string, unknown>): void` from `src/logging.ts`.
- Produces: Regression expectations that `debug` and `info` use stderr and that the shared runtime logger never calls `console.log`.

- [ ] **Step 1: Replace the info-log test with an stderr and redaction contract**

Use this test body in `test/unit/logging.test.ts`:

```ts
it('redacts secrets and writes info logs to stderr without using stdout', () => {
  const stdoutSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  const stderrSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

  log('info', 'Testing info log', {
    token: 'secret-value',
    password: 'top-secret',
    nested: {
      authorization: 'Bearer token',
      items: [{ secret: 'hidden' }]
    },
    error: new Error('boom')
  });

  expect(stdoutSpy).not.toHaveBeenCalled();
  expect(stderrSpy).toHaveBeenCalledTimes(1);

  const payload = JSON.parse(String(stderrSpy.mock.calls[0]?.[0])) as {
    level: string;
    message: string;
    context: Record<string, unknown>;
  };

  expect(payload.level).toBe('info');
  expect(payload.message).toBe('Testing info log');
  expect(payload.context).toEqual({
    token: '[redacted]',
    password: '[redacted]',
    nested: {
      authorization: '[redacted]',
      items: [{ secret: '[redacted]' }]
    },
    error: {
      name: 'Error',
      message: 'boom'
    }
  });
});
```

- [ ] **Step 2: Add a focused debug-log stream test**

Add this test after the info-log test:

```ts
it('writes debug logs to stderr without using stdout', () => {
  const stdoutSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  const stderrSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

  log('debug', 'Debug log', { component: 'scheduler' });

  expect(stdoutSpy).not.toHaveBeenCalled();
  expect(stderrSpy).toHaveBeenCalledTimes(1);
  expect(String(stderrSpy.mock.calls[0]?.[0])).toContain('"level":"debug"');
});
```

- [ ] **Step 3: Run the focused unit test and verify RED**

Run:

```bash
pnpm run test -- --runTestsByPath test/unit/logging.test.ts --runInBand
```

Expected: FAIL because the current `debug` and `info` branches call `console.log`; failures must mention that stdout was called or stderr was not called.

- [ ] **Step 4: Commit the failing unit regression tests**

```bash
git add test/unit/logging.test.ts
git commit -m "test: cover stdio-safe runtime logging"
```

---

### Task 2: Lock packaged scheduler startup stream separation with a failing integration test

**Files:**
- Modify: `test/integration/packaged-smoke.test.ts`
- Test: `test/integration/packaged-smoke.test.ts`

**Interfaces:**
- Consumes: built executable `dist/mcp.js`, `stopProcess(child: ChildProcess): Promise<void>`, and imported `delay`.
- Produces: A process-level assertion that scheduler lifecycle logs appear on stderr and stdout remains empty before any MCP request is sent.

- [ ] **Step 1: Add a bounded output-wait helper**

Add this function after `waitForHealth`:

```ts
async function waitForOutput(readOutput: () => string, expected: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (readOutput().includes(expected)) {
      return;
    }

    await delay(20);
  }

  throw new Error(`Timed out waiting for process output: ${expected}`);
}
```

- [ ] **Step 2: Add the scheduler-enabled stdio startup regression test**

Add this test after the existing `--version` test:

```ts
it('keeps scheduler runtime logs off stdout in packaged stdio mode', async () => {
  const child = spawn(process.execPath, ['dist/mcp.js'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HEALTH_MONITOR_AUTO_CHECK: '1',
      HEALTH_MONITOR_DB: ':memory:'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stdout = '';
  let stderr = '';
  child.stdout?.setEncoding('utf8');
  child.stderr?.setEncoding('utf8');
  child.stdout?.on('data', (chunk: string) => {
    stdout += chunk;
  });
  child.stderr?.on('data', (chunk: string) => {
    stderr += chunk;
  });

  try {
    await waitForOutput(
      () => `${stdout}\n${stderr}`,
      '"message":"Scheduler started"'
    );

    expect(stderr).toContain('"message":"Scheduler started"');
    expect(stdout).toBe('');
  } finally {
    await stopProcess(child);
  }
}, 10_000);
```

- [ ] **Step 3: Run the focused integration test and verify RED**

Run:

```bash
pnpm run test:integration -- --runTestsByPath test/integration/packaged-smoke.test.ts --runInBand
```

Expected: FAIL at `expect(stderr).toContain(...)` or `expect(stdout).toBe('')` because the current scheduler startup event is written through `console.log` to stdout. Existing package, version, and HTTP smoke tests must continue to execute.

- [ ] **Step 4: Commit the failing packaged-process regression test**

```bash
git add test/integration/packaged-smoke.test.ts
git commit -m "test: reproduce stdio scheduler log corruption"
```

---

### Task 3: Route info and debug runtime logs to stderr

**Files:**
- Modify: `src/logging.ts:41-52`
- Test: `test/unit/logging.test.ts`
- Test: `test/integration/packaged-smoke.test.ts`

**Interfaces:**
- Consumes: Existing serialized `payload` and `serialized` string in `log()`.
- Produces: The unchanged `log()` API with `debug`/`info` routed through `console.error`, `warn` through `console.warn`, and `error` through `console.error`.

- [ ] **Step 1: Apply the minimum production change**

Replace the switch in `src/logging.ts` with:

```ts
switch (level) {
  case 'error':
    console.error(serialized);
    break;
  case 'warn':
    console.warn(serialized);
    break;
  default:
    console.error(serialized);
    break;
}
```

Do not change serialization, redaction, types, or exports.

- [ ] **Step 2: Run the focused unit test and verify GREEN**

```bash
pnpm run test -- --runTestsByPath test/unit/logging.test.ts --runInBand
```

Expected: PASS, 4 tests passing, 0 failing.

- [ ] **Step 3: Run the focused packaged integration test and verify GREEN**

```bash
pnpm run test:integration -- --runTestsByPath test/integration/packaged-smoke.test.ts --runInBand
```

Expected: PASS, including package contents, `--version`, scheduler stderr separation, and HTTP health smoke coverage.

- [ ] **Step 4: Commit the production fix**

```bash
git add src/logging.ts
git commit -m "fix: keep runtime logs off MCP stdout"
```

---

### Task 4: Verify repository quality and publish the change for review

**Files:**
- Verify: `src/logging.ts`
- Verify: `test/unit/logging.test.ts`
- Verify: `test/integration/packaged-smoke.test.ts`
- Verify: `docs/superpowers/specs/2026-07-20-stdio-log-integrity-design.md`
- Verify: `docs/superpowers/plans/2026-07-20-stdio-log-integrity.md`

**Interfaces:**
- Consumes: All commits from Tasks 1-3.
- Produces: A pushed branch and pull request that closes GitHub issue #74.

- [ ] **Step 1: Run formatting and apply only required formatting changes**

```bash
pnpm exec prettier --write src/logging.ts test/unit/logging.test.ts test/integration/packaged-smoke.test.ts
```

Expected: Files are formatted according to repository Prettier configuration.

- [ ] **Step 2: Run all required local validation**

```bash
pnpm run build
pnpm run typecheck
pnpm run lint
pnpm run lint:test
pnpm run format:check
pnpm run test
pnpm run test:integration
pnpm run ci:check
```

Expected: Every command exits 0; the final coverage run satisfies global thresholds with 0 failed suites and 0 failed tests.

- [ ] **Step 3: Inspect the final diff and repository state**

```bash
git diff origin/main...HEAD --check
git diff --stat origin/main...HEAD
git status --short --branch
```

Expected: No whitespace errors; only the design, plan, logger, and two test files are changed; worktree is clean after commits.

- [ ] **Step 4: Commit any formatting-only changes if present**

```bash
git add src/logging.ts test/unit/logging.test.ts test/integration/packaged-smoke.test.ts
git diff --cached --quiet || git commit -m "style: format stdio integrity changes"
```

- [ ] **Step 5: Push the branch**

```bash
git push origin fix/74-stdio-log-integrity
```

Expected: Remote branch advances to the final local commit.

- [ ] **Step 6: Create a pull request**

Create a PR with:

```text
Title: fix: preserve MCP stdio protocol integrity

Body:
## Summary
- route structured info/debug runtime logs to stderr
- preserve JSON logging, redaction, warn/error behavior, and CLI version stdout
- add unit and packaged scheduler-start regression coverage

## Validation
- pnpm run build
- pnpm run typecheck
- pnpm run lint
- pnpm run lint:test
- pnpm run format:check
- pnpm run test
- pnpm run test:integration
- pnpm run ci:check

Closes #74
```

Expected: PR targets `main`, references `Closes #74`, and is ready for CI review.
