# Fix Summary for ENG-986 (PR #114 Remediation)

## Changes Made

### 1. Removed deprecated `pnpm.patchedDependencies` from `package.json`
- **File**: `package.json`
- **Issue**: pnpm v11 no longer reads the `pnpm` field from `package.json`, causing `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` and warnings
- **Fix**: Removed the `pnpm.patchedDependencies` section (lines 147-152). The patched dependencies are already correctly defined in `pnpm-workspace.yaml` with proper hashes in the lockfile.

### 2. Updated consumer-package validation for MCP SDK contract change
- **File**: `scripts/check-consumer-package.mjs`
- **Issue**: The bundled MCP SDK (@modelcontextprotocol/sdk@1.31.0) now declares `@hono/node-server` range as `^1.19.9 || ^2.0.5`, but the validation expected exactly `^2.0.5`
- **Fix**:
  - Added `EXPECTED_NODE_SERVER_RANGE = '^1.19.9 || ^2.0.5'` constant
  - Updated validation to use the new expected range
  - Added `stripWarnings()` function to handle pnpm warning output in `--json` mode

## Verification Results

All repository-prescribed checks pass:

| Check | Status |
|-------|--------|
| `pnpm install --frozen-lockfile` | ✅ Pass (no config mismatch) |
| `pnpm run ci:static` (build, typecheck, lint, format, docs) | ✅ Pass |
| `pnpm run test:ci` (206 tests) | ✅ Pass |
| `pnpm run check:metadata` | ✅ Pass |
| `pnpm run check:package` (consumer-package) | ✅ Pass |
| `pnpm run security` (audit) | ✅ Pass (2 ignored vulns per policy) |
| `pnpm run security:licenses` | ✅ Pass |
| `pnpm run release:dry-run` | ✅ Pass (expected blockers: uncommitted changes, existing npm package) |

**Note**: `pnpm run security:reuse` fails due to missing `reuse` Python module in the environment — a pre-existing issue unrelated to these changes.

## Scope

Changes are narrowly scoped to exactly address the two root causes identified in the issue:
1. pnpm patched-dependency configuration reconciliation
2. Consumer-package expectation update for current MCP SDK contract

No frozen-lockfile, repository policy, dependency/security checks, or tests were weakened.
