# Security

## Disclosure Policy

Use GitHub Private Vulnerability Reporting for this repository. Do not open a public issue for
suspected security vulnerabilities. The supported disclosure policy lives in `SECURITY.md`.

## PAT Token Storage

Azure DevOps PAT tokens are encrypted in the local SQLite database with AES-256-GCM when
`HEALTH_MONITOR_ENCRYPTION_KEY` is set. The key must be available when registering Azure
pipelines and when reading stored pipeline records.

Mitigations:

- Use minimal-scope PATs, ideally read-only build access
- Provide `HEALTH_MONITOR_ENCRYPTION_KEY` from a secret manager or protected local environment
- Store the DB in a protected path with OS-level file permissions
- Rotate PATs regularly
- Treat local workstation backups as sensitive if they include the monitor DB

Migration and local-only escape hatches:

- Existing base64 rows are blocked by default. Set
  `HEALTH_MONITOR_ALLOW_LEGACY_PAT_DECODING=1` only long enough to re-register pipelines with
  encryption enabled.
- New base64 storage is blocked by default. Set
  `HEALTH_MONITOR_ALLOW_INSECURE_PAT_STORAGE=1` only for disposable local test databases.

## HTTP MCP Mode

`POST /mcp` requires `Authorization: Bearer <HEALTH_MONITOR_HTTP_TOKEN>`. `GET /health`
remains unauthenticated and returns only status and version.

The default HTTP bind host is `127.0.0.1`. Binding to a non-loopback host requires:

- `HEALTH_MONITOR_HTTP_TOKEN`
- `HEALTH_MONITOR_PROFILE=remote-safe`, `chatgpt`, or `claude`

Raw `stdio` process execution is disabled in HTTP mode unless the deployment is explicitly
trusted local and sets `HEALTH_MONITOR_ALLOW_STDIO=1`. Remote connector
profiles always block raw `stdio` execution.

Stateful Streamable HTTP sessions are opt-in with `HEALTH_MONITOR_HTTP_STATEFUL_SESSIONS=1`.
They keep MCP transports alive between requests, so remote deployments should retain bearer token
authentication, Origin allowlisting, TLS at the reverse proxy, and conservative session limits via
`HEALTH_MONITOR_HTTP_SESSION_TTL_MS` and `HEALTH_MONITOR_HTTP_MAX_SESSIONS`.

## Supply-Chain Evidence

`pnpm run security:supply-chain` writes ignored evidence under `security-evidence/`:

- `sbom.cyclonedx.json` from `pnpm sbom --prod --sbom-format cyclonedx`
- `sbom.spdx.json` from `pnpm sbom --prod --sbom-format spdx`
- `licenses.json` from `pnpm licenses list --prod --json`

The gate also enforces a production dependency license allowlist of MIT, ISC, Apache-2.0,
BSD-2-Clause, and BSD-3-Clause, then runs `reuse lint` for repository-level SPDX/REUSE
compliance. CI uploads the evidence directory as a workflow artifact. Release jobs attach SBOMs
to GitHub Releases and verify the uploaded tarball checksum by downloading the release assets back
from GitHub.

Install REUSE locally before running the full CI script:

```bash
python -m pip install --user reuse==6.2.0
pnpm run ci
```

```powershell
python -m pip install --user reuse==6.2.0
pnpm run ci
```

## Local Stdio Monitoring

Local stdio monitoring is disabled by default. Enable it only on trusted workstations:

```bash
export HEALTH_MONITOR_ALLOW_STDIO=1
export HEALTH_MONITOR_STDIO_ALLOWLIST=npx,node,/usr/local/bin/my-mcp-server
```

Use a single executable in `command` and put every parameter in `args`:

```text
register_server name="local-debugger" type="stdio" command="npx" args=["mcp-debug-recorder"]
```

The command allowlist is optional but recommended. When set, entries must match the command exactly.
