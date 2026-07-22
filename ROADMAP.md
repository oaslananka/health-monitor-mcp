# Roadmap

GitHub milestones are the source of truth for planned work. Dates describe planning targets, not release guarantees.

## v1.1.0 — Runtime Safety, Alerting, and Release

Target: 2026-08-31
[Milestone](https://github.com/oaslananka/health-monitor-mcp/milestone/2)

- Retire Azure DevOps monitoring and remove obsolete credentials and stored pipeline data.
- Preserve MCP stdio protocol integrity and bound inbound HTTP resources.
- Use one concurrency policy for scheduled and interactive checks.
- Improve agent-facing errors, remediation hints, packaging, documentation, and release integrity.
- Continue alert incident and webhook delivery work as independently reviewable issues.

## v1.3.0 — Multi-Provider Monitoring

Target: 2026-10-15
[Milestone](https://github.com/oaslananka/health-monitor-mcp/milestone/3)

- GitHub Actions monitoring — complete; released through the v1.2.0 feature line.
- GitLab CI/CD monitoring — complete.
- Generic HTTP, TLS-expiry, and response-assertion monitoring.
- Provider contracts that reuse bounded concurrency without reintroducing provider-specific credentials into the core server registry.

## v1.4.0 — Observability and Operations

Target: 2026-11-15
[Milestone](https://github.com/oaslananka/health-monitor-mcp/milestone/4)

- Prometheus metrics and OpenTelemetry-compatible structured telemetry.
- Explicit availability and no-data semantics.
- Hardened GHCR artifacts, image provenance, and signing follow-up.

## v2.0.0 — Multi-User and Secret Hardening

Target: 2027-01-31
[Milestone](https://github.com/oaslananka/health-monitor-mcp/milestone/5)

- Workspace isolation, RBAC, and audit trails.
- External secret-provider and credential-recovery architecture where future providers require credentials.

## Research Backlog

[Milestone](https://github.com/oaslananka/health-monitor-mcp/milestone/6)

- Final MCP 2026 specification review.
- Stable TypeScript SDK v2 migration planning.
- Compatibility, ecosystem, and governance research that is not a release commitment.

Azure DevOps support was removed in v1.1.0. Issue #39 is superseded by that product decision; future provider work is tracked by provider-specific issues rather than an Azure compatibility layer.
