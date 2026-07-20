# Usage

## Install and Run

Run the published package noninteractively with Node.js 24:

```bash
npx -y health-monitor-mcp --version
```

A global installation remains optional. MCP clients should invoke `npx -y health-monitor-mcp` or
the installed `health-monitor-mcp` binary directly.

## Register a Server

Register an HTTP MCP server:

```text
register_server name="inventory-mcp" type="http" url="https://inventory.example.com/mcp" tags=["production","inventory"]
```

Register a stdio server only after trusted local opt-in:

```bash
export HEALTH_MONITOR_ALLOW_STDIO=1
export HEALTH_MONITOR_STDIO_ALLOWLIST=npx
```

```text
register_server name="local-debugger" type="stdio" command="npx" args=["-y","mcp-debug-recorder"] tags=["local","debug"]
```

`stdio` registration and execution are intended for trusted local use only. The `command` field
must be a single executable path or binary name; put all flags and package names in `args`. Raw
`stdio` process execution is disabled unless `HEALTH_MONITOR_ALLOW_STDIO=1` is set or the embedding
runtime explicitly enables it. Optional `HEALTH_MONITOR_STDIO_ALLOWLIST` entries must match the
command exactly, and remote-safe profiles always block stdio.

## Run Health Checks

Check one server:

```text
check_server name="inventory-mcp" timeout_ms=5000
```

Check all servers with bounded concurrency. `HEALTH_MONITOR_MAX_CONCURRENCY` applies to both
interactive batches and the background scheduler, and result order remains deterministic:

```text
check_all timeout_ms=5000
```

Filter by tag:

```text
check_all timeout_ms=5000 tags=["production"]
```


## Agent Error Envelopes

Expected configuration mistakes return stable JSON instead of an unstructured exception. Agents
should inspect `error.code`, apply `error.remediation`, and retry only when `error.retryable` is
`true`.

```json
{
  "ok": false,
  "error": {
    "code": "SERVER_NOT_FOUND",
    "message": "Server is not registered: inventory-mcp",
    "remediation": "Run register_server first, then retry the operation.",
    "retryable": false
  }
}
```

Current expected codes are `SERVER_NOT_FOUND`, `NO_SERVERS_REGISTERED`, `STDIO_DISABLED`, and
`STDIO_COMMAND_REJECTED`.

## Inspect Uptime

```text
get_uptime name="inventory-mcp" hours=24
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
set_alert name="inventory-mcp" max_response_time_ms=500 min_uptime_percent=99 consecutive_failures_before_alert=2
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
