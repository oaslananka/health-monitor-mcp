# Security

## Disclosure Policy

Use GitHub Private Vulnerability Reporting. Do not open a public issue for suspected vulnerabilities. The supported disclosure policy lives in `SECURITY.md`.

## Local Data

The SQLite database stores MCP target names, URLs or local commands, tags, health-check results, latency values, tool snapshots, and alert thresholds. Protect the database path with operating-system permissions and include it in backups only when the monitoring history is required.

Azure DevOps support was removed in v1.1.0. Migration v4 deletes the retired pipeline registration and run tables, including stored credentials.

## HTTP MCP Mode

`POST /mcp` requires `Authorization: Bearer <HEALTH_MONITOR_HTTP_TOKEN>`. `GET /health` remains unauthenticated and returns only status and version.

The default bind is loopback. Non-loopback HTTP requires:

- `HEALTH_MONITOR_HTTP_TOKEN`
- `HEALTH_MONITOR_PROFILE=remote-safe`, `chatgpt`, or `claude`
- `HEALTH_MONITOR_HTTP_ORIGIN_ALLOWLIST`

Use TLS at the reverse proxy. Preserve the Origin header and configure proxy body size and timeout limits at least as strictly as the application limits.

## Request Resource Limits

Inbound MCP bodies are bounded by:

- `HEALTH_MONITOR_HTTP_MAX_BODY_BYTES`
- `HEALTH_MONITOR_HTTP_BODY_TIMEOUT_MS`

Oversized and slow bodies stop application buffering, return deterministic JSON-RPC errors when the socket remains writable, and close the connection.

Stateful sessions are opt-in with `HEALTH_MONITOR_HTTP_STATEFUL_SESSIONS=1`. Keep conservative TTL and session caps with `HEALTH_MONITOR_HTTP_SESSION_TTL_MS` and `HEALTH_MONITOR_HTTP_MAX_SESSIONS`.

## Local stdio Monitoring

stdio launches local processes and is disabled by default. Enable it only on trusted machines:

```bash
export HEALTH_MONITOR_ALLOW_STDIO=1
export HEALTH_MONITOR_STDIO_ALLOWLIST=npx,node,/usr/local/bin/my-mcp-server
```

Use a single executable in `command` and put every parameter in `args`:

```text
register_server name="local-debugger" type="stdio" command="npx" args=["-y","mcp-debug-recorder"]
```

Commands containing shell syntax are rejected. When the allowlist is configured, the executable must match an entry exactly. Remote-safe profiles always block stdio.

## Agent-Facing Errors

Expected user-correctable failures return stable error codes and remediation hints rather than stack traces. Error payloads do not include bearer tokens, process environment values, or internal exception details.

## Supply-Chain Evidence

`pnpm run security:supply-chain` produces ignored evidence under `security-evidence/`:

- CycloneDX SBOM
- SPDX 2.3 SBOM
- production dependency license inventory
- REUSE/SPDX repository compliance result

CI uploads evidence as workflow artifacts. Releases attach the package tarball, checksum, package manifest, SBOMs, and build provenance. Publication workflows verify one exact component tag and commit before operating.

Install REUSE before the full local gate:

```bash
python -m pip install --user reuse==6.2.0
pnpm run ci
```
