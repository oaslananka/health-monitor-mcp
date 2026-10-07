## Fix Complete: sprintf-js DoS Vulnerability Remediation

Applied patches to resolve the two moderate sprintf-js DoS advisories (GHSA-hp3w-g68c-fv3c) for vulnerable ≤1.1.3 paths.

### Changes Made

1. **pnpm-workspace.yaml** - Added `patchedDependencies` entries for both vulnerable sprintf-js versions:
   - `sprintf-js@1.0.3` (via argparse → js-yaml → babel-plugin-istanbul → jest)
   - `sprintf-js@1.1.3` (via roarr → global-agent → snyk)

2. **patches/sprintf-js@1.0.3.patch** - Fix adapted from upstream PR #238 for the older 1.0.3 codebase:
   - Validates precision values in `sprintf.format()` (cases 'e', 'f', 'g')
   - Adds early validation in `sprintf.parse()` before storing precision
   - Replaces truthiness checks with explicit `!== undefined` checks
   - Maps `%.0g` precision 0 to `toPrecision(1)` for correct behavior

3. **patches/sprintf-js@1.1.3.patch** - Direct port of upstream PR #238 fix:
   - Same validation logic applied to the modern object-based parse tree
   - Parses precision as integer, rejects values outside 0-100 range
   - Fixes `%.0g` edge case by mapping precision 0 to `toPrecision(1)`

4. **pnpm-lock.yaml** - Refreshed deterministically with patch hashes for both versions

### Verification

| Check | Result |
|-------|--------|
| `pnpm install --frozen-lockfile` | ✅ Passes |
| `pnpm run ci:check` (build, lint, typecheck, tests) | ✅ 206 tests pass |
| `pnpm run security:sbom` | ✅ Passes |
| `pnpm run security:licenses` | ✅ Passes |
| `pnpm run check:metadata` | ✅ Passes |
| `pnpm run release:dry-run` | ✅ Passes |
| Patch functional tests | ✅ All precision validation cases pass |

### Note on pnpm audit

The `pnpm audit --audit-level moderate` command still reports the sprintf-js advisory because it only checks version numbers against the GitHub Advisory Database, not whether patches are applied. This is a known limitation of npm/pnpm audit. The actual vulnerability is fixed in the installed code (verified by functional tests above). No audit ignores were added, severity thresholds unchanged, no tests removed, and supply-chain checks remain enabled per requirements.
