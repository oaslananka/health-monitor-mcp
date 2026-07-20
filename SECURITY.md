# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 1.x     | Yes       |

## Reporting a Vulnerability

Use GitHub Private Vulnerability Reporting for this repository.

- Do not open a public GitHub issue for suspected security vulnerabilities.
- Include impact, affected version, reproduction steps, and proposed mitigation when available.
- Do not include production credentials or private customer data in the report.

## Current Security Boundaries

- MCP target metadata and health history are stored locally in SQLite.
- Remote `POST /mcp` requires a bearer token from `HEALTH_MONITOR_HTTP_TOKEN`.
- Non-loopback HTTP binds require a remote-safe profile and explicit Origin allowlist.
- Inbound MCP bodies have byte and body-read timeout limits.
- Local stdio process execution is disabled by default and supports an executable allowlist.
- Runtime logs use stderr so stdio stdout remains reserved for MCP protocol frames.
- Expected agent errors use stable remediation envelopes without exposing secrets or stack traces.
- Azure DevOps support and its stored credentials were removed in v1.1.0; migration v4 deletes retired pipeline data.
- Outbound webhook delivery is not yet exposed as a public MCP tool.

For implementation details, see `docs/security.md`.
