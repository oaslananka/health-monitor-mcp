# Operations

## HTTP Deployment

The HTTP server defaults to `HOST=127.0.0.1`. Non-loopback bind addresses require:

```bash
HEALTH_MONITOR_PROFILE=remote-safe
HEALTH_MONITOR_HTTP_TOKEN=...
HEALTH_MONITOR_HTTP_ORIGIN_ALLOWLIST=https://client.example
```

Use `chatgpt` or `claude` profiles only for remote connector experiments. They inherit the
remote-safe restrictions and keep raw `stdio` execution disabled.

## Credential Storage

Set `HEALTH_MONITOR_ENCRYPTION_KEY` before registering Azure DevOps pipeline groups. Store the key
outside the repository. The monitor never prints decrypted PAT values.

## Retention And Concurrency

- `HEALTH_MONITOR_RETENTION_DAYS` defaults to `30`.
- `HEALTH_MONITOR_MAX_CONCURRENCY` defaults to `5`.
- `HEALTH_MONITOR_HTTP_TIMEOUT_MS` defaults to `10000`.
- `HEALTH_MONITOR_AZURE_TIMEOUT_MS` defaults to `10000`.
- `HEALTH_MONITOR_WEBHOOK_TIMEOUT_MS` defaults to `5000`.
- `HEALTH_MONITOR_HTTP_SESSION_TTL_MS` defaults to `1800000` when stateful HTTP sessions are enabled.
- `HEALTH_MONITOR_HTTP_MAX_SESSIONS` defaults to `100` when stateful HTTP sessions are enabled.


## Stateful Streamable HTTP Sessions

Stateless HTTP mode remains the default and creates a fresh MCP transport for each `POST /mcp`
request. Enable stateful Streamable HTTP sessions only when a client needs MCP session continuity:

```bash
HEALTH_MONITOR_HTTP_STATEFUL_SESSIONS=1
HEALTH_MONITOR_HTTP_SESSION_TTL_MS=1800000
HEALTH_MONITOR_HTTP_MAX_SESSIONS=100
```

In stateful mode, initialize requests create an `mcp-session-id`. Follow-up `POST`, `GET`, and
`DELETE` calls must include that header. Expired or evicted sessions return a deterministic `404`,
and non-initialize requests without a session header return `400`. Keep bearer authentication,
Origin allowlisting, and reverse-proxy TLS in place for all remote deployments.

## Docker

The runtime image runs as the non-root `node` user and uses `HOST=127.0.0.1` by default. For remote
HTTP service deployment, set `HOST=0.0.0.0`, `HEALTH_MONITOR_PROFILE=remote-safe`,
`HEALTH_MONITOR_HTTP_TOKEN`, and `HEALTH_MONITOR_HTTP_ORIGIN_ALLOWLIST`.

## Repository Protection

The `main` branch must remain protected through GitHub branch protection. Required checks are:

- `Validate`
- `Workflow Security`
- `Docker Build`
- `CodeQL Analysis`
- `Review Thread Gate`

Actions must be restricted to selected actions, allow GitHub-owned actions, and allow only the
pinned non-GitHub-owned actions required by the workflows: `googleapis/release-please-action` and
`ossf/scorecard-action`. The live repository currently reports `sha_pinning_required=false`, so SHA
pinning is enforced by workflow review and CODEOWNERS rather than by the account-level setting.

Last verified: 2026-06-25. `main` branch protection is enabled with strict required checks,
code-owner reviews, linear history, force-push protection, and deletion protection.

Verify the live settings with:

```bash
gh api repos/oaslananka/health-monitor-mcp/branches/main/protection
gh api repos/oaslananka/health-monitor-mcp/actions/permissions
gh api repos/oaslananka/health-monitor-mcp/actions/permissions/selected-actions
```

PowerShell uses the same `gh api` commands.

## Remote HTTP Origin Policy

Remote HTTP deployments must define the browser origins that are allowed to call `POST /mcp`:

```bash
HOST=0.0.0.0
HEALTH_MONITOR_PROFILE=remote-safe
HEALTH_MONITOR_HTTP_TOKEN=change-me
HEALTH_MONITOR_HTTP_ORIGIN_ALLOWLIST=https://chat.example.com,https://ops.example.com
```

`GET /health` remains unauthenticated and only returns status/version. `GET /mcp` is intentionally
not supported and returns `405 Method Not Allowed` with `Allow: POST`. Reverse proxies should
preserve `Origin`, `Accept`, and `Authorization` headers and terminate TLS before forwarding to the
loopback-bound service whenever possible.
