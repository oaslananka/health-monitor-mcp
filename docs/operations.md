# Operations

## Runtime Pin

The repository pins Node.js 24.18.0 and pnpm 11.0.9 in `.mise.toml`.

```bash
mise trust
mise install
node --version
pnpm --version
```

## HTTP Deployment

The HTTP server defaults to `HOST=127.0.0.1`. Non-loopback bind addresses require:

```bash
HEALTH_MONITOR_PROFILE=remote-safe
HEALTH_MONITOR_HTTP_TOKEN=change-me
HEALTH_MONITOR_HTTP_ORIGIN_ALLOWLIST=https://client.example
HOST=0.0.0.0
```

`chatgpt` and `claude` profiles inherit remote-safe restrictions and always keep raw stdio execution disabled.

## Retention and Concurrency

- `HEALTH_MONITOR_RETENTION_DAYS` defaults to `30`.
- `HEALTH_MONITOR_MAX_CONCURRENCY` defaults to `5` and applies to both scheduled checks and interactive `check_all` calls.
- `HEALTH_MONITOR_HTTP_TIMEOUT_MS` defaults to `10000` for outbound MCP checks.
- `HEALTH_MONITOR_HTTP_MAX_BODY_BYTES` defaults to `1048576` for inbound `POST /mcp` bodies.
- `HEALTH_MONITOR_HTTP_BODY_TIMEOUT_MS` defaults to `15000` for reading an inbound body.
- `HEALTH_MONITOR_WEBHOOK_TIMEOUT_MS` defaults to `5000` for the internal webhook delivery foundation.
- `HEALTH_MONITOR_HTTP_SESSION_TTL_MS` defaults to `1800000` when stateful HTTP sessions are enabled.
- `HEALTH_MONITOR_HTTP_MAX_SESSIONS` defaults to `100` when stateful HTTP sessions are enabled.

When the target count exceeds the concurrency limit, excess checks remain queued in-process. Interactive results preserve registration order. One failed check does not cancel queued targets.

## Stateful Streamable HTTP Sessions

Stateless HTTP remains the default and creates a fresh MCP transport for each `POST /mcp` request. Enable stateful sessions only when a client requires continuity:

```bash
HEALTH_MONITOR_HTTP_STATEFUL_SESSIONS=1
HEALTH_MONITOR_HTTP_SESSION_TTL_MS=1800000
HEALTH_MONITOR_HTTP_MAX_SESSIONS=100
```

Initialize requests create `mcp-session-id`. Follow-up `POST`, `GET`, and `DELETE` calls must send that header. Expired or evicted sessions return `404`; non-initialize requests without a session ID return `400`.

## Request Limits and Reverse Proxies

Set the reverse-proxy request-body limit to the same value as, or lower than, `HEALTH_MONITOR_HTTP_MAX_BODY_BYTES`. Set its body-read timeout to the same duration as, or shorter than, `HEALTH_MONITOR_HTTP_BODY_TIMEOUT_MS`.

- Oversized bodies receive HTTP `413` with a JSON-RPC error envelope.
- Incomplete slow bodies receive HTTP `408` with a JSON-RPC error envelope.
- Both responses close the connection and stop application buffering.

Preserve `Origin`, `Accept`, `Authorization`, and `mcp-session-id` headers. Terminate TLS before forwarding to the loopback-bound service whenever possible.

## Docker

The image runs as the non-root `node` user. The default database path inside the image is `/data/health.db`; mount `/data` persistently.

```bash
docker volume create health-monitor-data

docker run --rm \
  -v health-monitor-data:/data \
  -p 127.0.0.1:3000:3000 \
  -e HOST=0.0.0.0 \
  -e HEALTH_MONITOR_PROFILE=remote-safe \
  -e HEALTH_MONITOR_HTTP_TOKEN=change-me \
  -e HEALTH_MONITOR_HTTP_ORIGIN_ALLOWLIST=https://client.example \
  ghcr.io/oaslananka/health-monitor-mcp:1.1.0
```

Running with `--rm` without a volume discards the SQLite database when the container exits.

## Local stdio Operations

Enable stdio only for trusted local targets:

```bash
HEALTH_MONITOR_ALLOW_STDIO=1
HEALTH_MONITOR_STDIO_ALLOWLIST=node,npx
```

Use one executable in `command`; put flags and package names in `args`. Remote-safe profiles block stdio even when the environment variable is set.

## Database Upgrades

Migrations run automatically at startup and are recorded in `schema_migrations`. Migration v4 removes retired Azure pipeline tables, credentials, indexes, and run history. Back up the database before upgrading when historical retention outside the supported product is required.

## Codecov Operations

The repository stores `CODECOV_TOKEN` as an Actions secret. The validation job uploads explicit LCOV
and JUnit paths with a pinned Codecov v7 action; upload failures are non-blocking because Jest test
results and local coverage thresholds remain authoritative. Project and patch statuses are
informational with `target: auto` and a 1% threshold.

Validate the repository configuration with:

```bash
curl --fail --data-binary @codecov.yml https://codecov.io/validate
```

Bundle Analysis remains disabled until the project ships a supported application bundle.

## Container Security

The `Docker Build` required check builds `health-monitor-mcp:ci`, performs a CLI smoke test, and runs
Trivy against the local image. Fixed high or critical vulnerabilities fail the job. SARIF is uploaded
to GitHub Code Scanning when a report exists. The scanner does not duplicate GitHub/Gitleaks secret
scanning.

## Repository Protection

The active solo-maintainer ruleset requires pull requests, linear history, resolved review threads,
strict status checks, and protection from deletion or force-push. It intentionally requires zero
external approvals because there is no second maintainer. Repository merge settings allow squash
only, keep auto-merge enabled, and delete merged branches automatically.

The required checks are:

- `Validate`
- `Workflow Security`
- `Docker Build`
- `CodeQL Analysis`
- `Review Thread Gate`
- `dependency-review`

Workflows pin third-party actions by commit SHA. CI also runs Codecov, Trivy, Semgrep, Snyk, SonarQube Cloud, Socket, Renovate validation, package checks, SBOM generation, license policy, and REUSE compliance. Native merge queue and Mergify are deferred because the repository has low concurrent PR volume; no `merge_group` trigger is required. Renovate owns version updates and vulnerability PRs, while Dependabot alerts remain enabled without duplicate version-update configuration.

Verify live settings with:

```bash
gh api repos/oaslananka/health-monitor-mcp/rulesets
gh api repos/oaslananka/health-monitor-mcp/actions/permissions
gh api repos/oaslananka/health-monitor-mcp/actions/permissions/selected-actions
gh api repos/oaslananka/health-monitor-mcp/actions/permissions/workflow
gh api repos/oaslananka/health-monitor-mcp/vulnerability-alerts -i
```
