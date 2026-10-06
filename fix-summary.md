All 7 actionable findings from PR #112 have been resolved:

## Summary of Changes

### 1. Prevent leaking ciphertext (`src/webhook-registry.ts:41-42`)
- `mapTarget()` now explicitly destructures and omits `secret_encrypted` from the returned public object
- The internal `secret_encrypted` field is no longer spread into `RegisteredWebhookTarget` objects exposed via MCP tools

### 2. Safe decryption failure handling (`src/webhook-registry.ts:34-38`)
- Removed the placeholder `'[decryption-failed]'` secret string
- Decryption failures now propagate as thrown errors (via `decryptSecret()`) instead of silently returning a placeholder that could be used for HMAC signing
- When encryption key is not configured, returns `'[encrypted]'` as before (indicating secret exists but cannot be decrypted)

### 3. Non-blocking key derivation (`src/crypto.ts:8-10`)
- Replaced `scryptSync` (blocking) with HMAC-SHA256 based key derivation (HKDF-like)
- `deriveKey()` now uses `createHmac('sha256', masterKey).update(salt).digest()` which is fast and non-blocking
- Removed unused `KEY_LENGTH` constant

### 4. Accurate HTTP status reporting (`src/webhooks.ts:108-118`)
- `testWebhook()` now captures and returns the actual HTTP response status code (`response.status`) instead of hardcoding `200`
- On failure, returns the actual error status code when available (`response?.status ?? null`)

### 5. Retention-aligned pruning (`src/webhook-registry.ts:179-190`)
- `pruneWebhookDeliveries()` now uses the passed `now` timestamp and `getRetentionDays()` (which reads `HEALTH_MONITOR_RETENTION_DAYS`)
- Deletes records older than the retention window instead of hardcoding a limit of 1000 records

### 6. Fix status mapping (`src/webhook-registry.ts:51-57`)
- `listableStatus()` now correctly maps:
  - `'delivered'` → `'up'`
  - `'failed'` → `'down'`
  - All others (including `null`) → `'unknown'`

### 7. Tests and verification
- Updated test expectations in `test/unit/webhooks.test.ts` to match new behavior (actual status codes)
- All verification commands pass:
  - `pnpm run build` ✓
  - `pnpm run typecheck` ✓
  - `pnpm run lint` ✓
  - `pnpm run lint:test` ✓
  - `pnpm run format:check` ✓
  - `pnpm run docs:api:check` ✓
  - `pnpm test` ✓ (203 tests passing)
  - `pnpm run ci:check` ✓

Working tree changes are left in place for the trusted publisher to update PR #112.
