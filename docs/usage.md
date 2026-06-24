# Usage

## Install and Run

The first public npm release target is `health-monitor-mcp@1.0.0`. If npm still returns `E404`,
the publish gate has not completed yet.

```bash
npm install -g health-monitor-mcp
health-monitor-mcp --version
```

After installing the package, configure desktop MCP clients to run the `health-monitor-mcp`
binary directly.

## Register a Server

Register an HTTP MCP server:

```text
register_server name="mcp-ssh-tool" type="http" url="https://mcp-ssh-tool.onrender.com/mcp" tags=["devops","ssh"]
```

Register a stdio server only after trusted local opt-in:

```bash
export HEALTH_MONITOR_ALLOW_STDIO=1
export HEALTH_MONITOR_STDIO_ALLOWLIST=npx
```

```text
register_server name="local-debugger" type="stdio" command="npx" args=["mcp-debug-recorder"] tags=["local","debug"]
```

`stdio` registration and execution are intended for trusted local use only. The `command` field
must be a single executable path or binary name; put all flags and package names in `args`. Raw
`stdio` process execution is disabled unless `HEALTH_MONITOR_ALLOW_STDIO=1` is set or the embedding
runtime explicitly enables it. Optional `HEALTH_MONITOR_STDIO_ALLOWLIST` entries must match the
command exactly, and remote-safe profiles always block stdio.

## Run Health Checks

Check one server:

```text
check_server name="mcp-ssh-tool" timeout_ms=5000
```

Check all servers:

```text
check_all timeout_ms=5000
```

Filter by tag:

```text
check_all timeout_ms=5000 tags=["devops"]
```

## Inspect Uptime

```text
get_uptime name="mcp-ssh-tool" hours=24
```

## View the Dashboard

```text
get_dashboard hours=24 include_tool_stats=true
```

The dashboard includes:

- current status
- uptime percentage
- average response time
- consecutive failures
- current alert findings

## Configure Alerts

```text
set_alert name="mcp-ssh-tool" max_response_time_ms=500 min_uptime_percent=99 consecutive_failures_before_alert=2
```

Alert findings are surfaced by:

- `check_server`
- `check_all`
- `get_dashboard`

v1 only evaluates and reports alerts. It does not send outbound notifications.

## List or Remove Servers

```text
list_servers
list_servers tags=["ssh"]
unregister_server name="local-debugger"
```

## Monitor Statistics

```text
get_monitor_stats
```

This reports:

- total registered servers
- total health checks performed
- monitoring start time
- resolved database path

## Data Storage

Default database path:

```text
~/.mcp-health-monitor/health.db
```

Override path with:

```bash
HEALTH_MONITOR_DB=/custom/path/health.db
```

## HTTP Mode

`GET /health` is unauthenticated and returns only status and version. `POST /mcp` requires:

```bash
HEALTH_MONITOR_HTTP_TOKEN=change-me
```

Clients must send:

```text
Authorization: Bearer change-me
```

The default host is `127.0.0.1`. Binding to `0.0.0.0` or another non-loopback address requires
`HEALTH_MONITOR_PROFILE=remote-safe`, `chatgpt`, or `claude`, plus an explicit
`HEALTH_MONITOR_HTTP_ORIGIN_ALLOWLIST`.

Enable stateful Streamable HTTP sessions when clients need an `mcp-session-id` across requests:

```bash
HEALTH_MONITOR_HTTP_STATEFUL_SESSIONS=1
HEALTH_MONITOR_HTTP_SESSION_TTL_MS=1800000
HEALTH_MONITOR_HTTP_MAX_SESSIONS=100
```

When stateful mode is enabled, initialize requests create the session header. Follow-up `POST`,
`GET`, and `DELETE` requests must send `mcp-session-id`; missing session headers return `400`,
and expired or evicted sessions return `404`.
