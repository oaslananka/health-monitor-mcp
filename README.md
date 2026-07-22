# health-monitor-mcp

> MCP server and GitHub Actions monitoring, uptime history, diagnostics, alert evaluation, and operational reports through natural-language tools.

[![CI](https://github.com/oaslananka/health-monitor-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/oaslananka/health-monitor-mcp/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/oaslananka/health-monitor-mcp/graph/badge.svg)](https://codecov.io/gh/oaslananka/health-monitor-mcp)
[![Release](https://github.com/oaslananka/health-monitor-mcp/actions/workflows/release.yml/badge.svg)](https://github.com/oaslananka/health-monitor-mcp/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/oaslananka/health-monitor-mcp/badge)](https://scorecard.dev/viewer/?uri=github.com/oaslananka/health-monitor-mcp)
[![Node.js](https://img.shields.io/badge/node-%3E%3D24-brightgreen)](https://nodejs.org)

## What This Does

`health-monitor-mcp` keeps local registries of MCP servers and GitHub Actions workflows, performs live checks, records history in SQLite, evaluates MCP alert thresholds, and returns JSON or Markdown evidence suitable for agents and operators.

Supported target transports:

- **Streamable HTTP** for current remote MCP servers.
- **SSE** for legacy MCP servers.
- **stdio** for trusted local executables after explicit opt-in.
- **GitHub Actions** workflow runs, failed jobs, and failed steps for public or private repositories.

Azure DevOps monitoring was retired in v1.1.0. GitHub Actions is the first provider added by the v1.2.0 multi-provider roadmap.

## Quick Start

Run the published package noninteractively with Node.js 24:

```bash
npx -y health-monitor-mcp --version
```

Example MCP client configuration:

```json
{
  "mcpServers": {
    "health-monitor": {
      "command": "npx",
      "args": ["-y", "health-monitor-mcp"]
    }
  }
}
```

## Tools

| Tool                         | Purpose                                                   | Typical prompt                                      |
| ---------------------------- | --------------------------------------------------------- | --------------------------------------------------- |
| `register_server`            | Register an MCP target                                    | `Register inventory-prod`                           |
| `check_server`               | Run one MCP health check                                  | `Check inventory-prod now`                          |
| `register_github_actions`    | Register a GitHub workflow                                | `Monitor ci.yml in owner/repo`                      |
| `check_github_actions`       | Check latest run and failed job/step diagnostics          | `Check repo-ci now`                                 |
| `check_all`                  | Check all matching target kinds with bounded concurrency  | `Check all production targets`                      |
| `get_uptime`                 | Return MCP uptime and latency history                     | `Show 24h uptime for inventory-prod`                |
| `get_dashboard`              | Return a cross-provider JSON dashboard                    | `Give me a 24h dashboard`                           |
| `get_report`                 | Return a cross-provider Markdown report                   | `Generate a 24h health report`                      |
| `list_servers`               | List registered MCP targets                               | `List monitored MCP servers`                        |
| `list_github_actions`        | List registered GitHub workflow targets                   | `List monitored workflows`                          |
| `unregister_server`          | Remove an MCP target                                      | `Stop monitoring local-debugger`                    |
| `unregister_github_actions`  | Remove a GitHub workflow target and its history            | `Stop monitoring repo-ci`                           |
| `set_alert`                  | Configure MCP health thresholds                           | `Alert if inventory-prod exceeds 500ms`             |
| `get_monitor_stats`          | Inspect cross-provider monitor activity                   | `How many checks are stored?`                       |

Expected configuration mistakes return stable error codes and remediation hints, including `SERVER_NOT_FOUND`, `GITHUB_ACTIONS_TARGET_NOT_FOUND`, `NO_SERVERS_REGISTERED`, `STDIO_DISABLED`, and `STDIO_COMMAND_REJECTED`.

## Register Targets

Streamable HTTP:

```text
register_server name="inventory-prod" type="http" url="https://inventory.example.com/mcp" tags=["production","inventory"]
```

Legacy SSE:

```text
register_server name="legacy-search" type="sse" url="https://search.example.com/sse" tags=["legacy"]
```

Trusted local stdio:

```bash
export HEALTH_MONITOR_ALLOW_STDIO=1
export HEALTH_MONITOR_STDIO_ALLOWLIST=npx,node
```

```text
register_server name="local-debugger" type="stdio" command="npx" args=["-y","mcp-debug-recorder"] tags=["local"]
```

The `command` field must contain one executable only. Put package names and flags in `args`. Remote-safe runtime profiles always disable stdio.

## Register GitHub Actions

Public repositories can be checked without authentication. Private repositories and higher API rate limits require a token with Actions read access:

```bash
export GITHUB_TOKEN=your-runtime-secret
```

```text
register_github_actions name="repo-ci" owner="oaslananka" repository="health-monitor-mcp" workflow="ci.yml" branch="main" token_env="GITHUB_TOKEN" tags=["production","ci"]
check_github_actions name="repo-ci" timeout_ms=5000
```

Only the environment-variable name in `token_env` is stored. The token value is read at check time and is never written to SQLite, logs, reports, or tool responses.

## Health Checks and Reports

```text
check_server name="inventory-prod" timeout_ms=5000
check_all timeout_ms=5000 tags=["production"]
get_uptime name="inventory-prod" hours=24
get_dashboard hours=24 include_tool_stats=true
get_report hours=24
```

`HEALTH_MONITOR_MAX_CONCURRENCY` limits MCP and GitHub Actions checks through one shared scheduled and interactive queue. Results preserve MCP-then-GitHub registration order even when checks complete out of order.

## Alerts

```text
set_alert name="inventory-prod" max_response_time_ms=500 min_uptime_percent=99 consecutive_failures_before_alert=2
```

Alert findings are evaluated by `check_server`, `check_all`, and `get_dashboard`. Outbound webhook delivery is not yet exposed as a public MCP tool.

## Configuration

| Variable                                | Default                           | Purpose                                       |
| --------------------------------------- | --------------------------------- | --------------------------------------------- |
| `HEALTH_MONITOR_DB`                     | `~/.mcp-health-monitor/health.db` | SQLite database path                          |
| `HEALTH_MONITOR_AUTO_CHECK`             | `0`                               | Enable scheduled checks with `1`              |
| `HEALTH_MONITOR_RETENTION_DAYS`         | `30`                              | Health-history retention                      |
| `HEALTH_MONITOR_MAX_CONCURRENCY`        | `5`                               | Scheduled and interactive check concurrency   |
| `GITHUB_TOKEN`                         | unset                             | Optional token with GitHub Actions read access     |
| `HEALTH_MONITOR_ALLOW_STDIO`            | `0`                               | Allow trusted local stdio checks              |
| `HEALTH_MONITOR_STDIO_ALLOWLIST`        | unset                             | Optional comma-separated executable allowlist |
| `HEALTH_MONITOR_HTTP_TOKEN`             | unset                             | Bearer token for `POST /mcp`                  |
| `HEALTH_MONITOR_HTTP_ORIGIN_ALLOWLIST`  | unset                             | Allowed remote client origins                 |
| `HEALTH_MONITOR_HTTP_MAX_BODY_BYTES`    | `1048576`                         | Maximum inbound MCP body                      |
| `HEALTH_MONITOR_HTTP_BODY_TIMEOUT_MS`   | `15000`                           | Inbound body read timeout                     |
| `HEALTH_MONITOR_HTTP_STATEFUL_SESSIONS` | `0`                               | Enable stateful Streamable HTTP sessions      |
| `HEALTH_MONITOR_HTTP_SESSION_TTL_MS`    | `1800000`                         | Stateful session TTL                          |
| `HEALTH_MONITOR_HTTP_MAX_SESSIONS`      | `100`                             | Stateful session cap                          |

## HTTP Deployment

The server binds to `127.0.0.1` by default. A non-loopback bind requires a remote-safe profile, bearer token, and Origin allowlist.

```bash
HOST=0.0.0.0 \
HEALTH_MONITOR_PROFILE=remote-safe \
HEALTH_MONITOR_HTTP_TOKEN=change-me \
HEALTH_MONITOR_HTTP_ORIGIN_ALLOWLIST=https://client.example \
npx -y health-monitor-mcp-http
```

`GET /health` is unauthenticated and exposes only status and version. `POST /mcp` requires `Authorization: Bearer <token>`.

## Docker

Persist `/data`; otherwise the SQLite database disappears with the container.

```bash
docker volume create health-monitor-data

docker run --rm \
  -v health-monitor-data:/data \
  -p 127.0.0.1:3000:3000 \
  -e HOST=0.0.0.0 \
  -e HEALTH_MONITOR_PROFILE=remote-safe \
  -e HEALTH_MONITOR_HTTP_TOKEN=change-me \
  -e HEALTH_MONITOR_HTTP_ORIGIN_ALLOWLIST=https://client.example \
  ghcr.io/oaslananka/health-monitor-mcp:latest
```

## Development

The repository pins Node.js 24.18.0 and pnpm 11.14.0 through `.mise.toml`.

```bash
mise trust
mise install
pnpm install --frozen-lockfile
pnpm run ci
```

Useful gates:

```bash
pnpm run build
pnpm run typecheck
pnpm run lint
pnpm run lint:test
pnpm run test:coverage
pnpm run test:integration
pnpm run docs:api:check
pnpm run security:supply-chain
pnpm run check:metadata
pnpm run check:package
```

## Coverage and Test Analytics

Jest remains the blocking coverage gate with repository-local thresholds. The CI validation job runs
all unit and integration tests once, writes `coverage/lcov.info` and
`reports/junit/junit.xml`, and uploads both reports to Codecov. Codecov project and patch statuses
start as informational with `target: auto` and a 1% tolerance, adding pull-request diff coverage,
file-level visibility, and failed-test analytics without duplicating the local merge gate.

Codecov Bundle Analysis is intentionally not enabled. This package ships Node.js entrypoints compiled
with `tsc`; it does not currently produce a Rollup, Vite, or Webpack application bundle whose download
size is a product metric.

## Architecture and Roadmap

- [Architecture](docs/architecture.md)
- [Operations](docs/operations.md)
- [Security](docs/security.md)
- [Usage](docs/usage.md)
- [Roadmap](ROADMAP.md)
- [Release process](docs/release.md)
- [Generated API reference](docs/api/README.md)

## Agent Runtime Configuration

This repository owns its product-specific MCP configuration, plugin manifest, and skills:

| File                           | Purpose                               |
| ------------------------------ | ------------------------------------- |
| `.claude-plugin/plugin.json`   | Claude Code plugin manifest           |
| `.mcp.json`                    | Project-local MCP configuration       |
| `.codex/config.example.toml`   | Codex CLI example                     |
| `.vscode/mcp.example.json`     | VS Code / Copilot example             |
| `opencode.example.jsonc`       | OpenCode example                      |
| `skills/`                      | Product-specific monitoring workflows |
| `docs/agent-runtime-config.md` | Runtime setup and validation          |

## Security and Contributing

Report vulnerabilities through GitHub Private Vulnerability Reporting. See [SECURITY.md](SECURITY.md) and [docs/security.md](docs/security.md).

Contribution setup and standards are documented in [docs/contributing.md](docs/contributing.md). Usage questions belong in GitHub Discussions; actionable work belongs in issues.

## License

MIT
