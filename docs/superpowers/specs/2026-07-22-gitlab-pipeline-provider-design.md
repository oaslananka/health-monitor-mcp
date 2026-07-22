# GitLab CI/CD Pipeline Monitoring Provider Design

## Context

Issue #41 adds GitLab CI/CD monitoring after the GitHub Actions provider shipped in v1.2.1. The repository now has a proven provider pattern: provider-specific schema, API client, SQLite registry/history, public MCP tools, and integration into the shared `check_all`, scheduler, dashboard, report, and monitor statistics surfaces.

The GitLab provider must support GitLab.com and explicitly approved self-hosted GitLab instances without storing access-token values. It must return pipeline, job, stage, ref, commit, URL, and bounded trace excerpts for failures.

## Goals

- Register, list, check, and unregister GitLab pipeline targets.
- Check the newest project pipeline, optionally filtered by ref.
- Return failed/canceled job diagnostics and bounded trace excerpts.
- Support GitLab.com and allowlisted self-hosted HTTPS origins.
- Store only an environment-variable name for authentication.
- Reuse the existing ordered bounded-concurrency orchestration.
- Persist provider-specific health history and dashboard aggregates.
- Cover success, failure, auth, rate-limit, timeout, malformed response, trace, and self-hosted validation paths with mocked API tests.

## Non-goals

- Triggering, retrying, canceling, or mutating pipelines/jobs.
- OAuth login flows, token creation, rotation, or encrypted token persistence.
- Arbitrary HTTP endpoint monitoring; issue #42 owns generic HTTP/TLS/assertion monitoring.
- A generic provider framework refactor. GitHub and GitLab remain independent modules with shared orchestration only.
- Downloading complete large job traces.

## Public tools

- `register_gitlab_pipeline`
- `check_gitlab_pipeline`
- `list_gitlab_pipelines`
- `unregister_gitlab_pipeline`

`check_all` includes MCP servers, GitHub Actions targets, then GitLab pipeline targets while preserving provider and registration order under one `HEALTH_MONITOR_MAX_CONCURRENCY` limit.

## Registration contract

`register_gitlab_pipeline` accepts:

- `name`: stable local target name.
- `base_url`: GitLab origin; defaults to `https://gitlab.com`.
- `project`: numeric project ID or namespace/project path.
- `ref`: optional branch or tag filter.
- `token_env`: environment-variable name; defaults to `GITLAB_TOKEN`.
- `tags`: existing tag semantics.
- `check_interval_minutes`: 1-60.

The database stores `token_env`, never the token value.

## Self-hosted origin policy

A base URL must:

- use HTTPS;
- contain no username/password, query, or fragment;
- be an origin only, with an empty or `/` path;
- normalize to a trailing-slash-free origin.

`https://gitlab.com` is always allowed. Every other origin must appear exactly in the comma-separated `HEALTH_MONITOR_GITLAB_BASE_URL_ALLOWLIST`. This explicit operator allowlist supports private self-hosted instances without turning the tool into an arbitrary SSRF primitive. Registration fails with a stable remediation error when the origin is not allowed.

## GitLab REST API client

The client uses:

- `GET /api/v4/projects/:id/pipelines?per_page=1&order_by=id&sort=desc[&ref=...]`
- `GET /api/v4/projects/:id/pipelines/:pipeline_id/jobs?per_page=100&include_retried=false`
- `GET /api/v4/projects/:id/jobs/:job_id/trace`

Project paths are encoded as one URL component. Authentication uses the `PRIVATE-TOKEN` header only when `token_env` resolves to a non-empty value. Public projects can be checked without a token.

Requests include the monitor user agent. The API client has one total timeout budget and at most one retry for HTTP 429 and 5xx responses. 401, 403, and 404 responses are not retried and return redacted, actionable errors.

## Response and resource bounds

- JSON responses: maximum 1,000,000 bytes.
- Pipeline list: one pipeline.
- Pipeline jobs: maximum 100 jobs parsed, maximum 20 failed diagnostics returned.
- Trace request: asks for the final 16 KiB using `Range: bytes=-16384`.
- Trace body: maximum 64 KiB read; excerpt is sanitized and limited to 8,192 characters.
- ANSI control sequences and GitLab section markers are stripped from excerpts.
- Token values are never interpolated into errors, logs, persisted data, or responses.

If a trace is missing, too large, malformed, or separately unavailable, the pipeline result remains valid; that job receives a nullable excerpt and a bounded trace error field.

## Status mapping

Pipeline statuses:

- `success`, `skipped` -> `up`
- `failed`, `canceled` -> `down`
- `created`, `waiting_for_resource`, `preparing`, `waiting_for_callback`, `pending`, `running`, `canceling`, `manual`, `scheduled` -> `up` with the original pipeline status preserved
- unknown status -> `error`

For down pipelines, jobs with `failed` or `canceled` status are returned. A failed pipeline with no failed jobs remains `down` and records an empty diagnostic list.

## Persistence

Migration v6 creates:

### `gitlab_pipeline_targets`

- identity/configuration fields
- token environment-variable name
- tags and interval
- latest status, response time, pipeline ID/status/URL
- consecutive failures

### `gitlab_pipeline_checks`

- target, timestamp, health status, response time
- pipeline ID/IID/status/ref/SHA/URL/source
- error message
- failed jobs JSON

Foreign-key cascade removes history when a target is unregistered. Existing retention settings prune provider history.

## Dashboard, report, and statistics

`get_dashboard` adds a `gitlab_pipelines` array and summary counts without removing existing fields. `get_report` adds a GitLab Pipelines table. `get_monitor_stats` adds GitLab target/check totals and includes them in all-provider totals and earliest monitoring time.

## Scheduler

The scheduler adds GitLab targets to the existing `ScheduledTarget` union. MCP, GitHub, and GitLab checks share one concurrency queue. Provider failures remain isolated and do not cancel queued work.

## Error model

Add stable code `GITLAB_PIPELINE_TARGET_NOT_FOUND`. Registration policy errors use `GITLAB_BASE_URL_NOT_ALLOWED`. Live API failures remain structured provider check results rather than tool-envelope failures.

## Testing

- schema and origin policy boundaries;
- migration v6 and cascade behavior;
- GitLab API success/nonterminal/failure mapping;
- failed job/stage/ref/commit/URL diagnostics;
- trace excerpt sanitization and size bounds;
- unauthenticated public request and `PRIVATE-TOKEN` header behavior;
- 401/403/404/429/5xx/timeout/malformed responses;
- registry CRUD/history/retention/dashboard;
- public tool lifecycle and shared `check_all` output ordering;
- scheduler shared concurrency across all three provider kinds;
- package metadata, generated API docs, README/usage/architecture/operations/security/roadmap.

## Release planning

This is a new feature after v1.2.1 and therefore produces a SemVer minor release. The current multi-provider milestone becomes v1.3.0; the existing observability milestone moves to v1.4.0 so public planning matches release semantics.
