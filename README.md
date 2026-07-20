# health-monitor-mcp

> MCP server health monitoring, uptime tracking, Azure DevOps pipeline status,
> and alert evaluation through natural-language tools.

[![CI](https://github.com/oaslananka/health-monitor-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/oaslananka/health-monitor-mcp/actions/workflows/ci.yml)
[![Release](https://github.com/oaslananka/health-monitor-mcp/actions/workflows/release.yml/badge.svg)](https://github.com/oaslananka/health-monitor-mcp/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/oaslananka/health-monitor-mcp/badge)](https://scorecard.dev/viewer/?uri=github.com/oaslananka/health-monitor-mcp)
[![Node.js](https://img.shields.io/badge/node-%3E%3D24-brightgreen)](https://nodejs.org)

## What This Does

`health-monitor-mcp` keeps a registry of the MCP servers you care about, performs real MCP
handshakes against them, records health history in SQLite, and reports uptime, latency, and
alert thresholds back through MCP tools. It also tracks Azure DevOps pipelines so app health
and delivery health can be checked from the same place.

## Quick Start

The first public npm release target is `health-monitor-mcp@1.0.0`. If npm still returns `E404`,
the publish gate has not completed yet.

```bash
npm install -g health-monitor-mcp
health-monitor-mcp --version
```

Example desktop MCP client entry after installing the package:

```json
{
  "name": "health-monitor-mcp",
  "version": "1.0.0",
  "mcpName": "io.github.oaslananka/health-monitor-mcp",
  "description": "Monitor MCP server health, uptime, response times, and Azure DevOps pipelines",
  "transport": "stdio",
  "command": "health-monitor-mcp",
  "args": []
}
```

## Tools Reference

| Tool | Purpose | Typical prompt |
| ---- | ------- | -------------- |
| `register_server` | Save an MCP server to monitor | `Register https://example.com/mcp as prod-gateway` |
| `check_server` | Run a live health check for one server | `Check prod-gateway now` |
| `check_all` | Check all registered servers | `Check all my MCP servers` |
| `get_uptime` | Return uptime plus latency stats | `Show 24h uptime for prod-gateway` |
| `get_dashboard` | Return JSON dashboard data | `Give me a 24h dashboard` |
| `get_report` | Return a Markdown report | `Generate a Markdown health report for 24h` |
| `list_servers` | Show registered servers | `List all monitored servers` |
| `unregister_server` | Remove a server | `Stop monitoring local-debugger` |
| `set_alert` | Configure thresholds | `Alert if prod-gateway exceeds 500ms or drops below 99% uptime` |
| `get_monitor_stats` | Show monitor-level stats | `How many checks has the monitor recorded?` |
| `register_azure_pipelines` | Register Azure pipeline groups | `Track CI and Publish pipelines for my repo` |
| `check_pipeline_status` | Read latest Azure pipeline runs | `Check pipeline status for my release group` |
| `get_pipeline_logs` | Fetch Azure build logs | `Show the failed logs for the latest Publish build` |
| `check_all_projects` | Combine MCP and Azure health | `Check all projects` |

## Azure DevOps Integration

Register a pipeline group with an org, project, pipeline names, and a PAT:

```text
register_azure_pipelines name="health-monitor-mcp" organization="oaslananka" project="open-source" pipeline_names=["Health Monitor CI","Publish npm"] pat_token="..."
```

PAT tokens are encrypted in the local SQLite database with AES-256-GCM when
`HEALTH_MONITOR_ENCRYPTION_KEY` is set. Local insecure storage is available only when
`HEALTH_MONITOR_ALLOW_INSECURE_PAT_STORAGE=1` is explicitly set. See
[credential storage notes](https://github.com/oaslananka/health-monitor-mcp/blob/main/docs/security.md).

## Alert Configuration

Use `set_alert` to configure one server:

| Field | Meaning |
| ----- | ------- |
| `max_response_time_ms` | Alert when a check exceeds this latency |
| `min_uptime_percent` | Alert when the selected uptime window drops below this value |
| `consecutive_failures_before_alert` | Alert after this many non-up results in a row |

Alerts are evaluated inline by `check_server`, `check_all`, and `get_dashboard`. Webhook delivery
is planned for v1.1, and no webhook MCP tool is shipped in v1.0.x.

## Data Storage

- Default database path: `~/.mcp-health-monitor/health.db`
- Override path: `HEALTH_MONITOR_DB=/custom/path/health.db`
- Optional background scheduler: `HEALTH_MONITOR_AUTO_CHECK=1`
- HTTP MCP endpoint token: `HEALTH_MONITOR_HTTP_TOKEN=...`
- HTTP bind host: `HOST=127.0.0.1` by default
- Remote-safe HTTP profile: `HEALTH_MONITOR_PROFILE=remote-safe`
- Remote HTTP Origin allowlist: `HEALTH_MONITOR_HTTP_ORIGIN_ALLOWLIST=https://client.example`
- HTTP request body limit: `HEALTH_MONITOR_HTTP_MAX_BODY_BYTES=1048576` by default
- HTTP request body timeout: `HEALTH_MONITOR_HTTP_BODY_TIMEOUT_MS=15000` by default
- Optional stateful HTTP sessions: `HEALTH_MONITOR_HTTP_STATEFUL_SESSIONS=1`
- Stateful HTTP session TTL: `HEALTH_MONITOR_HTTP_SESSION_TTL_MS=1800000` by default
- Stateful HTTP session cap: `HEALTH_MONITOR_HTTP_MAX_SESSIONS=100` by default
- Local stdio checks opt-in: `HEALTH_MONITOR_ALLOW_STDIO=1`
- Optional stdio command allowlist: `HEALTH_MONITOR_STDIO_ALLOWLIST=node,npx`
- HTTP server health endpoint: `GET /health`

Configuration is environment-variable driven; use the variables above directly in your shell,
service manager, or MCP client environment block. Stdio monitoring launches local child
processes and is disabled unless `HEALTH_MONITOR_ALLOW_STDIO=1` is set or an embedding
application explicitly enables it through runtime policy. Keep the executable in `command` and
put arguments in `args`; for example, use `command="npx" args=["mcp-debug-recorder"]`.

The DB uses WAL mode on file-backed databases and applies schema migrations automatically on
startup.

## Docker

Build and run:

```bash
docker build -t health-monitor-mcp .
docker run --rm health-monitor-mcp node dist/mcp.js --version
```

HTTP mode binds to loopback by default. For a remote HTTP deployment, require a bearer token,
the remote-safe profile, and an Origin allowlist:

```bash
docker run --rm \
  -p 127.0.0.1:3000:3000 \
  -e HOST=0.0.0.0 \
  -e HEALTH_MONITOR_PROFILE=remote-safe \
  -e HEALTH_MONITOR_HTTP_TOKEN=change-me \
  -e HEALTH_MONITOR_HTTP_ORIGIN_ALLOWLIST=https://client.example \
  health-monitor-mcp
curl -X POST \
  --oauth2-bearer "$HEALTH_MONITOR_HTTP_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  http://127.0.0.1:3000/mcp
```

## Development

```bash
corepack enable
corepack prepare pnpm@11.0.9 --activate
pnpm install --frozen-lockfile
pnpm run build
pnpm test
pnpm run test:integration
pnpm run lint
pnpm run lint:test
pnpm run format:check
pnpm run test:coverage
pnpm run docs:api:check
pnpm run ci
```

Runtime support targets Node 24 LTS or newer. CI, Docker, package metadata, and local development
commands are aligned to Node `>=24`.

## Architecture

High-level module map:

- `src/app.ts`: MCP tool registration and response formatting
- `src/checker.ts`: Live MCP connectivity probes with retry/backoff
- `src/registry.ts`: SQLite read/write paths for servers, checks, and pipeline records
- `src/db.ts` + `src/migrations.ts`: Connection setup and schema upgrades
- `src/server-http.ts` + `src/mcp.ts`: HTTP and stdio entrypoints for local MCP clients and packaged CLI usage
- `src/scheduler.ts`: Optional background auto-check loop

More detail lives in [architecture.md](https://github.com/oaslananka/health-monitor-mcp/blob/main/docs/architecture.md).
Decision rationale lives in [docs/adr](https://github.com/oaslananka/health-monitor-mcp/blob/main/docs/adr/README.md),
and generated API docs live in [docs/api](https://github.com/oaslananka/health-monitor-mcp/blob/main/docs/api/README.md).

## Roadmap

Detailed milestone planning lives in [ROADMAP.md](https://github.com/oaslananka/health-monitor-mcp/blob/main/ROADMAP.md).

- [x] v1.0: Core monitoring, uptime, alerts, Azure pipelines, Markdown reports
- [ ] v1.1: Webhook notifications for Slack, Discord, and custom endpoints
- [ ] v1.2: Multi-provider pipeline and generic HTTP monitoring
- [ ] v2.0: Multi-user support and optional external secret-provider integrations

## Security

Read [SECURITY.md](https://github.com/oaslananka/health-monitor-mcp/blob/main/SECURITY.md) for vulnerability reporting and [docs/security.md](https://github.com/oaslananka/health-monitor-mcp/blob/main/docs/security.md) for implementation-specific storage details.

## Contributing

See [contributing.md](https://github.com/oaslananka/health-monitor-mcp/blob/main/docs/contributing.md) for setup, standards, and PR expectations.
Governance, triage labels, and maintainer response targets are documented in
[governance.md](https://github.com/oaslananka/health-monitor-mcp/blob/main/docs/governance.md).
Usage questions belong in [GitHub Discussions](https://github.com/oaslananka/health-monitor-mcp/discussions);
tracked work should use the repository issue forms.

## License

MIT

## Agent plugin and runtime configuration

This repository owns the product-level agent plugin, MCP runtime configuration, and product-specific skills for `health-monitor-mcp`. The central [`agent-tools`](https://github.com/oaslananka/agent-tools) repository should catalog this plugin, but the manifest and workflow instructions live here so they stay synchronized with the actual MCP server package.

| File | Purpose |
| --- | --- |
| [`.claude-plugin/plugin.json`](.claude-plugin/plugin.json) | Claude Code-valid product plugin manifest. |
| [`.mcp.json`](.mcp.json) | Claude Code project-local MCP server configuration. |
| [`.codex/config.example.toml`](.codex/config.example.toml) | Codex CLI MCP configuration example. |
| [`.vscode/mcp.example.json`](.vscode/mcp.example.json) | VS Code / GitHub Copilot workspace MCP configuration example. |
| [`opencode.example.jsonc`](opencode.example.jsonc) | OpenCode project MCP configuration example. |
| `.opencode/skills/` | OpenCode-native mirrored skill definitions. |
| [`docs/agent-runtime-config.md`](docs/agent-runtime-config.md) | Agent runtime setup and validation notes. |

Validate plugin packaging locally:

```bash
claude plugin validate .
```
