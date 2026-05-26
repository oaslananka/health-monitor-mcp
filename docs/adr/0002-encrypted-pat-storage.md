# ADR 0002: Encrypted Azure DevOps PAT Storage

Status: Accepted

Date: 2026-05-26

## Context

Azure DevOps pipeline monitoring requires a PAT to query build and log APIs. The monitor stores
pipeline registrations locally so repeated checks do not require re-registering credentials.
Storing cleartext PATs in SQLite would expose credentials through backups, diagnostics, and local
file reads.

## Decision

Encrypt PATs with AES-256-GCM when `HEALTH_MONITOR_ENCRYPTION_KEY` is set. Keep legacy base64 PAT
decoding only for migration compatibility and require
`HEALTH_MONITOR_ALLOW_INSECURE_PAT_STORAGE=1` before accepting insecure local storage.

## Consequences

- Production-like installs can keep PATs encrypted at rest.
- Local insecure storage remains possible for explicit test or throwaway environments.
- Future migrations can identify encrypted values through the `aes-256-gcm:v1` prefix.
- Logs, reports, and issue templates must continue to treat PATs as secrets.

## Validation

```bash
pnpm test -- registry
pnpm run ci:check
```
