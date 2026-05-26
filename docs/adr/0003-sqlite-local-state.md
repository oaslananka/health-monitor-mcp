# ADR 0003: SQLite Local State

Status: Accepted

Date: 2026-05-26

## Context

The monitor records registered MCP servers, health checks, alert thresholds, Azure pipeline groups,
and recent pipeline runs. The v1.0 package is designed as a single-process local MCP server, not as a
multi-tenant hosted service.

## Decision

Use local SQLite through `better-sqlite3`, enable WAL mode for file-backed databases, and apply
versioned migrations at startup. Keep the default database path under
`~/.mcp-health-monitor/health.db`, with `HEALTH_MONITOR_DB` available for operators who need a
custom path.

## Consequences

- Users get durable local history without operating a separate database.
- Startup remains deterministic because schema migrations run before tools accept work.
- Retention pruning can run in-process without a background service dependency.
- A future multi-user service would need a separate ADR before replacing the storage model.

## Validation

```bash
pnpm test -- migrations registry
pnpm run test:integration
```
