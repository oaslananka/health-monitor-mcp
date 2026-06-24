# ADR 0001: Runtime Transport Policy

Status: Accepted

Date: 2026-05-26

## Context

The monitor can run as a local stdio MCP server or as an HTTP MCP endpoint. Stdio checks can launch
local commands, which is useful on a developer workstation but unsafe for remote deployments. HTTP
deployments need a predictable way to reject stdio checks unless an operator explicitly opts in.

## Decision

Keep stdio enabled for the default local profile and disable it for remote-safe profiles. HTTP mode
requires bearer-token authentication when bound to a non-loopback host, and `createRuntimePolicy`
centralizes the `stdio` versus `http` decision for tool handlers.

## Consequences

- Local users can monitor stdio MCP servers without extra flags.
- Remote HTTP deployments avoid command execution by default.
- Operators can opt in to stdio only with `HEALTH_MONITOR_ALLOW_STDIO=1` outside remote-safe
  profiles.
- Tests can assert transport policy without starting a full server.

## Validation

```bash
pnpm run ci:check
pnpm run docs:api
```

## 2026-06-24 Update

Stdio checks now require explicit opt-in even in the default local profile. Operators can enable
trusted local stdio checks with `HEALTH_MONITOR_ALLOW_STDIO=1` and can restrict executable names
with `HEALTH_MONITOR_STDIO_ALLOWLIST`. The monitor rejects compound command strings before creating
a transport; arguments must be supplied through `args`.
