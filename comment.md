## Round 2 Remediation Complete

Applied deterministic pre-commit normalization and regenerated pnpm-lock.yaml patched-dependency hashes.

### Changes Made

1. **Pre-commit normalization applied** (trailing-whitespace + end-of-file-fixer):
   - `patches/sprintf-js@1.0.3.patch` — removed trailing whitespace, added EOF newline
   - `patches/sprintf-js@1.1.3.patch` — removed trailing whitespace, added EOF newline
   - `fix-summary.md` — added EOF newline

2. **Regenerated pnpm-lock.yaml** with updated patchedDependencies hashes:
   - `sprintf-js@1.0.3`: `f45b95...` → `dfc468...`
   - `sprintf-js@1.1.3`: `66f59b...` → `9fa9a8...`

### Verification Results

| Check | Status |
|-------|--------|
| `pnpm install --frozen-lockfile` | ✅ Lockfile consistent |
| `pnpm audit --audit-level moderate` | ✅ 2 vulnerabilities ignored (GHSA-hp3w-g68c-fv3c, GHSA-vfj7-8cjw-p6xm) |
| `pnpm run format:check` | ✅ Prettier clean |
| `pnpm run lint` / `lint:test` | ✅ ESLint clean |
| `pnpm run typecheck` | ✅ TypeScript clean |
| `pnpm run build` | ✅ Compilation succeeds |
| Unit tests | ✅ 202 tests pass (31 suites) |
| Repository policy (semgrep) | ✅ Passes |
| Pre-commit hooks (whitespace, EOF, yaml, json, toml) | ✅ All pass |

The security audit remains clean; only Repository Policy (semgrep) was failing before and now passes. No audit ignore policy changes or gate weakening required.