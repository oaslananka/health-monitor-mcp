# GitHub Actions Monitoring Provider Design

## Context

Issue #40 asks the monitor to observe GitHub Actions workflows. The issue still refers to the retired Azure DevOps `check_all_projects` tool; the current product exposes `check_all` as the only bounded batch operation. The provider must therefore integrate with `check_all`, the background scheduler, dashboard output, and reports without reintroducing Azure-specific abstractions.

GitHub's REST API exposes workflow-run and workflow-job endpoints. The provider will use API version `2026-03-10`, request the latest run for a configured workflow, and fetch jobs only when the run needs failure diagnostics.

## Goals

- Register, list, check, schedule, and remove GitHub Actions workflow targets.
- Return workflow, run, job, failed-step, branch, commit, conclusion, and URL diagnostics.
- Include GitHub Actions targets in `check_all`, `get_dashboard`, `get_report`, and monitor statistics.
- Preserve current MCP server tool responses and database data.
- Never persist GitHub tokens or token values.
- Keep provider requests bounded by the existing timeout and concurrency controls.
- Test all API paths with injected mocked fetch responses.

## Non-goals

- GitHub Enterprise Server base URLs.
- Workflow log archive downloads.
- Re-running, cancelling, or dispatching workflows.
- GitHub App installation-token exchange.
- A generic provider framework shared with future GitLab and HTTP targets.
- Alert incident lifecycle or webhook delivery changes.

## Considered approaches

### 1. Encode GitHub workflows as MCP servers

This would reuse the existing `servers` and `health_checks` tables, but it would overload MCP transport fields with repository metadata and lose structured workflow diagnostics. Rejected.

### 2. Introduce a generic provider/target framework first

This could support GitHub, GitLab, and HTTP through one schema, but it would combine three independent roadmap issues and require a migration of the stable MCP server model. Rejected as premature.

### 3. Add a focused GitHub Actions provider with shared orchestration integration

Use provider-specific tables and modules while sharing bounded fan-out, scheduling, dashboard aggregation, and reports. This is the selected approach because it is isolated, testable, and does not constrain future provider designs.

## Public tools

Four tools are added:

- `register_github_actions`
- `check_github_actions`
- `list_github_actions`
- `unregister_github_actions`

`check_all` remains the single batch operation. Its existing `results` array remains, but each result gains a `kind` discriminator:

- `mcp_server`
- `github_actions`

Existing MCP result fields remain unchanged. The summary wording changes from “servers” to “targets” only when GitHub targets are present.

## Registration schema

`register_github_actions` accepts:

- `name`: unique monitor-local name, using the existing safe-name policy.
- `owner`: GitHub owner or organization, 1–100 characters, alphanumeric plus `.`, `_`, and `-`.
- `repository`: GitHub repository name, 1–100 characters, alphanumeric plus `.`, `_`, and `-`.
- `workflow`: numeric workflow ID or workflow filename ending in `.yml` or `.yaml`.
- `branch`: optional Git ref name used as the workflow-runs filter.
- `token_env`: environment-variable name, default `GITHUB_TOKEN`.
- `tags`: existing safe tag list.
- `check_interval_minutes`: integer 1–60, default 5.

Only the environment-variable name is stored. The token value is read for each check. When the named variable is absent, the provider makes an unauthenticated request, which supports public repositories but has a lower API rate limit. Private repository monitoring therefore requires an Actions-read token in the configured environment variable.

## API client

`src/github-actions.ts` owns external API behavior and exports an injectable runtime for tests.

Request headers:

- `Accept: application/vnd.github+json`
- `X-GitHub-Api-Version: 2026-03-10`
- `User-Agent: health-monitor-mcp/<version>`
- `Authorization: Bearer <token>` only when `token_env` resolves to a non-empty value

Latest run request:

`GET /repos/{owner}/{repository}/actions/workflows/{workflow}/runs?per_page=1[&branch=...]`

Failed diagnostics request:

`GET /repos/{owner}/{repository}/actions/runs/{run_id}/jobs?filter=latest&per_page=100`

The API base is fixed to `https://api.github.com`. Every path component and query value is URL encoded.

## Status mapping

- Completed `success`, `neutral`, or `skipped` runs map to `up`.
- Completed `failure`, `cancelled`, `timed_out`, `action_required`, `startup_failure`, or `stale` runs map to `down`.
- `queued`, `in_progress`, `waiting`, `requested`, and `pending` runs map to `up` with their non-terminal run status preserved.
- Missing workflow runs map to `error` with a remediation message.
- Authentication, authorization, not-found, malformed-response, rate-limit, and timeout failures map to `error` or `timeout` without exposing token values.

Jobs are fetched only for terminal non-success conclusions. A failed-job diagnostic contains:

- job name and URL;
- status and conclusion;
- start and completion timestamps;
- failed/cancelled/timed-out step number, name, status, conclusion, and timestamps.

## Persistence

Migration 5 creates:

### `github_actions_targets`

Configuration and latest state:

- `name` primary key;
- owner, repository, workflow, branch, token_env;
- JSON tags;
- check interval and creation time;
- latest check time/status/response time;
- latest run ID/conclusion/URL;
- consecutive failures.

### `github_actions_checks`

Historical observations:

- target name foreign key with cascade delete;
- timestamp, status, response time, and error message;
- run ID, workflow name, run number/attempt, run status, conclusion, event;
- branch, commit SHA, and run URL;
- JSON failed-job diagnostics.

Indexes cover target/time and global timestamp queries. History is pruned using `HEALTH_MONITOR_RETENTION_DAYS`, matching MCP health retention.

## Orchestration

### `check_all`

MCP servers and GitHub targets are converted to one ordered task list. `mapWithConcurrency` applies one shared `HEALTH_MONITOR_MAX_CONCURRENCY` limit across both provider kinds. A failure in one target does not cancel queued checks.

### Scheduler

The scheduler builds the same two-kind task list from due MCP servers and due GitHub targets. It preserves stdio policy only for MCP tasks. Logging includes the target kind and name.

## Dashboard and report

`get_dashboard` preserves the existing `servers` field and summary keys. It adds:

- `github_actions`: provider-specific dashboard rows;
- `summary.total_targets`;
- `summary.github_actions_targets`;
- `summary.github_actions_up`;
- `summary.github_actions_down`.

`get_report` keeps the MCP table and appends a “GitHub Actions” table with target, repository, workflow, branch, status, latest conclusion, latest run, uptime, average response time, and consecutive failures.

`get_monitor_stats` adds GitHub target and GitHub check counts while keeping existing fields.

## Error handling and security

- Token values are never written to SQLite, logs, diagnostics, tool output, snapshots, or docs.
- API response bodies are parsed through bounded schemas; unknown fields are ignored.
- Error excerpts are bounded and sanitized.
- 401/403/404 are not retried.
- 429 and 5xx responses are retried once through the existing bounded retry helper.
- Timeout covers the entire run request plus optional jobs request.
- Job collection is bounded to 100 latest-attempt jobs and failed steps only.

## Testing

- Unit tests mock successful, running, failed, unauthorized, rate-limited, timeout, no-run, and malformed GitHub API responses.
- Registry tests cover CRUD, history, dashboard aggregation, pruning, tags, and cascade deletion.
- Migration tests verify version 5 and idempotency.
- App tests cover all four tools, `check_all`, dashboard, report, stats, and missing token behavior.
- Scheduler tests verify mixed-provider due filtering and one shared concurrency limit.
- Packaged smoke and MCP metadata tests require the new tool names.
- Full CI, audit, SBOM, REUSE, pre-commit, Codecov YAML validation, Docker/Trivy, and all PR bot checks remain required.

## Documentation

README, usage, architecture, operations, security, roadmap, MCP metadata, and server metadata will document the provider, environment-only token policy, required token permissions, public unauthenticated behavior, and troubleshooting guidance.
