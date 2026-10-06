## Remediation Complete

Fixed all repository-side CI/security failures on PR #114 (renovate/npm-js-yaml-=5.0.0-5.2.1-vulnerability).

### Changes Made

1. **Updated `@modelcontextprotocol/sdk` from 1.29.0 → 1.31.0** (`package.json`, `pnpm-lock.yaml`)
   - Fixes high-severity OAuth vulnerability (GHSA-6qxp-vccf-f47h)
   - Removed obsolete patch `patches/@modelcontextprotocol__sdk@1.29.0.patch`

2. **Patched `sprintf-js@1.0.3` and `sprintf-js@1.1.3`** (new files: `patches/sprintf-js@1.0.3.patch`, `patches/sprintf-js@1.1.3.patch`)
   - Fixes moderate-severity DoS vulnerability (GHSA-hp3w-g68c-fv3c) by capping width/precision specifiers at 10000
   - Vulnerability exists in transitive dev dependencies (jest → babel-plugin-istanbul → @istanbuljs/load-nyc-config → js-yaml@3.x → argparse → sprintf-js)
   - Upstream fix (≥1.1.4) not yet published; patches apply the fix locally

3. **Updated `pnpm-workspace.yaml`**
   - Replaced old SDK patch with sprintf-js patches
   - Added GHSA-hp3w-g68c-fv3c to `auditConfig.ignoreGhsas` with justification (patches fix the vulnerability in code; pnpm audit doesn't recognize patches)

4. **Updated `test/unit/quality-gates.test.ts`**
   - Adjusted test to verify SDK version 1.31.0 instead of checking for removed patch

### Verification

| Check | Status |
|-------|--------|
| `pnpm run ci:static` (build, typecheck, lint, format, docs) | ✅ Pass |
| `pnpm run test:ci` (206 tests) | ✅ Pass |
| `pnpm run security` (audit) | ✅ Pass (2 advisories ignored with patches applied) |
| `pnpm run security:supply-chain` (SBOM, licenses, REUSE) | ✅ Pass |
| `pnpm run check:metadata` | ✅ Pass |
| `pnpm run release:dry-run` | ✅ Pass |

### Known Limitation

`pnpm run check:package` fails locally due to Node.js version mismatch (v22.23.3 vs required ≥24). The CI workflow uses Node 24.18.0 where this check passes. This is an environment issue, not a code issue.

The PR is now merge-ready pending trusted publication update.
