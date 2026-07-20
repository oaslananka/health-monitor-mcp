# MCP Stdio Log Integrity Design

**Issue:** #74 — Preserve MCP stdio protocol integrity by routing runtime logs to stderr  
**Date:** 2026-07-20  
**Status:** Approved for implementation planning

## Problem

The MCP stdio transport reserves standard output for protocol messages. The current shared logger writes `debug` and `info` events with `console.log`, which targets stdout. When `HEALTH_MONITOR_AUTO_CHECK=1`, the stdio entrypoint starts the scheduler before connecting the MCP transport, and scheduler lifecycle or check events can therefore emit non-protocol JSON log lines on stdout.

A single unexpected stdout line can corrupt the JSON-RPC stream observed by an MCP client. This is a release-blocking runtime defect because it can make an otherwise healthy server appear malformed or disconnected.

The `--version` command is not an active MCP session and must continue to print the version to stdout for normal CLI composition.

## Goals

- Guarantee that application runtime logs never use stdout.
- Preserve the existing structured JSON log format and secret redaction behavior.
- Preserve `node dist/mcp.js --version` output on stdout.
- Add regression coverage that exercises both the logger and a packaged stdio process with the scheduler enabled.
- Keep the change small, transport-independent, and compatible with HTTP operation.

## Non-goals

- Introducing a new logging dependency.
- Adding configurable log destinations or log levels.
- Reworking scheduler behavior, timing, or concurrency.
- Changing MCP protocol messages or transport lifecycle.
- Changing the CLI contract for `--version`.

## Chosen Approach

Route every structured runtime log level through stderr in `src/logging.ts`.

The logger will continue to serialize the same payload:

```json
{
  "timestamp": "ISO-8601 timestamp",
  "level": "debug|info|warn|error",
  "message": "event message",
  "context": {}
}
```

All levels will use stderr-backed console methods. Existing `warn` and `error` routing will remain unchanged, while `debug` and `info` will move from `console.log` to `console.error`. The serialized `level` field remains the authoritative severity signal, and the change stays limited to the unsafe stdout branch.

`src/mcp.ts` will retain its direct `console.log(MONITOR_VERSION)` call inside the early `--version` branch. That branch returns before the scheduler and MCP transport start, so it does not violate the stdio protocol boundary.

## Alternatives Considered

### Transport-aware logger

A logger mode could select stdout for HTTP and stderr for stdio. This adds global runtime state or dependency injection without a product requirement. Runtime logs on stderr are conventional and safe for both transports, so this design rejects the extra complexity.

### Stdio-only console interception

The stdio entrypoint could monkey-patch `console.log` while the server runs. This is process-wide, fragile, and would not reliably cover future direct writes or third-party behavior. The shared logger is the correct boundary.

### Scheduler-only changes

Changing only scheduler log calls would leave every other future `info` or `debug` event capable of corrupting stdout. The invariant belongs in the logger, not individual callers.

## Components and Changes

### `src/logging.ts`

- Keep `LogLevel`, redaction, error serialization, timestamps, and JSON encoding unchanged.
- Preserve the level switch, but replace the default stdout branch with an stderr-backed call.
- Do not expose a new public API.

### `src/mcp.ts`

- No functional change is expected.
- Preserve the `--version` stdout behavior explicitly through regression coverage.

### `test/unit/logging.test.ts`

Update logger tests to verify:

- `info` logs are emitted through stderr.
- `debug` logs are emitted through stderr.
- `warn` and `error` logs remain on stderr.
- `console.log` is not called for runtime log levels.
- Redaction and error serialization remain unchanged.

### `test/integration/packaged-smoke.test.ts`

Add a packaged-process regression test that:

1. Builds the package.
2. Spawns `dist/mcp.js` with `HEALTH_MONITOR_AUTO_CHECK=1` and an in-memory database.
3. Captures stdout and stderr independently.
4. Allows the process to initialize long enough for the scheduler startup event to occur.
5. Terminates the process cleanly.
6. Asserts scheduler/runtime log output appears only on stderr.
7. Asserts stdout contains no non-protocol scheduler log line.

The test must not depend on a complete MCP client exchange. Its purpose is to prove stream separation at process startup. Existing packaged `--version` coverage continues to prove that CLI version output remains on stdout.

## Data Flow

1. Runtime component calls `log(level, message, context)`.
2. Logger sanitizes context recursively.
3. Logger serializes one JSON object.
4. Logger writes the serialized object to stderr.
5. MCP SDK alone owns stdout during an active stdio server session.

## Error Handling

Logging remains best-effort and synchronous, matching current behavior. This change does not introduce retry, buffering, or file output. Serialization behavior is unchanged; unsupported cyclic objects remain outside the scope of this issue.

Shutdown behavior in `src/mcp.ts` remains unchanged. The integration test must always terminate the child in a `finally` block so test failures do not leak a process.

## Testing Strategy

The change follows TDD:

1. Modify unit expectations so `info` and `debug` require stderr and stdout prohibition. Confirm the current implementation fails.
2. Add the packaged scheduler-enabled stdio regression test. Confirm the current implementation exposes a scheduler log on stdout and fails.
3. Apply the minimum logger change.
4. Run focused unit and packaged integration tests.
5. Run typecheck, lint, formatting, build, and the repository CI check.

Required validation commands:

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js --runTestsByPath test/unit/logging.test.ts --runInBand
node --experimental-vm-modules node_modules/jest/bin/jest.js --runTestsByPath test/integration/packaged-smoke.test.ts --runInBand
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm run build
pnpm run ci:check
```

If the repository's script names differ at implementation time, the plan must use the exact available equivalents from `package.json` without weakening coverage.

## Acceptance Criteria

- No call to the shared runtime logger writes to stdout at any log level.
- Structured log payloads and redaction remain backward-compatible.
- Scheduler-enabled stdio startup does not place scheduler logs on stdout.
- Scheduler/runtime logs are observable on stderr.
- `--version` still returns exactly `MONITOR_VERSION` on stdout.
- Focused tests and the complete repository quality gate pass.
- The pull request references and closes #74.

## Rollout and Compatibility

This is a backward-compatible runtime fix. Operators that previously scraped application logs from stdout must switch to stderr, but stdout was never a valid logging channel for MCP stdio operation. No database migration, environment variable change, or release configuration change is required.

The fix should be released before #77 synchronizes and publishes v1.1.0 artifacts.
