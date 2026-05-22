# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 1.x     | Yes       |

## Reporting a Vulnerability

Use GitHub Private Vulnerability Reporting for this repository.

- Do not open a public GitHub issue for suspected security vulnerabilities.
- Include a clear impact summary, affected version, reproduction steps, and any proposed mitigation.

## Current Sensitive Data Handling

- Azure DevOps PAT tokens are encrypted with AES-256-GCM when
  `HEALTH_MONITOR_ENCRYPTION_KEY` is configured.
- Legacy base64 PAT rows are refused unless `HEALTH_MONITOR_ALLOW_LEGACY_PAT_DECODING=1`
  is explicitly set for migration.
- MCP server URLs, commands, and tags are stored locally in SQLite.
- HTTP MCP mode requires `Authorization: Bearer <token>` backed by
  `HEALTH_MONITOR_HTTP_TOKEN`.
- Webhook delivery is not shipped in v1.0.x.

For implementation details and storage notes, see `docs/security.md`.
