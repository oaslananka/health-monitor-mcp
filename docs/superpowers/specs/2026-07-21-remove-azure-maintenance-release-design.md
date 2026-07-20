# Remove Azure DevOps and Consolidate the v1.1.0 Maintenance Release

**Date:** 2026-07-21  
**Issues:** #39, #51, #53, #77, #78  
**Release target:** 1.1.0

## Decision

Remove Azure DevOps as a product capability rather than replacing it with another CI provider in this change. Consolidate the removal with bounded batch concurrency, agent-facing structured errors, documentation/runtime alignment, and release orchestration in one reviewable pull request.

## Considered approaches

### 1. Azure-only removal

Delete the Azure client, tools, configuration, tests, and docs. This is the smallest change, but it leaves known v1.1.0 release, documentation, concurrency, and agent UX issues unresolved.

### 2. Consolidated maintenance release — selected

Remove Azure and complete the tightly related maintenance work that becomes simpler after the removal:

- close obsolete Azure issue #39;
- complete #78 by sharing one bounded-concurrency primitive between the scheduler and `check_all`;
- complete #51 with deterministic tool error envelopes and clearer transport prerequisites;
- complete #53 by aligning runtime pins, metadata, roadmap, Docker persistence, and public docs;
- complete #77 by synchronizing release metadata and hardening release publication around one exact tag and commit.

This maximizes issue closure without adding a new provider or changing the core monitoring model.

### 3. Replace Azure with GitHub Actions in the same PR

Implement #40 while deleting Azure. This would combine a destructive removal with a new authenticated provider, new secret handling, rate limits, API semantics, and substantially more tests. It is rejected as too risky for a single maintenance release.

## Product surface after the change

The server monitors MCP servers over Streamable HTTP, legacy SSE, and explicitly enabled local stdio. The public tool set is:

- `register_server`
- `check_server`
- `check_all`
- `get_uptime`
- `get_dashboard`
- `get_report`
- `list_servers`
- `unregister_server`
- `set_alert`
- `get_monitor_stats`

The following tools are removed:

- `register_azure_pipelines`
- `check_pipeline_status`
- `get_pipeline_logs`
- `check_all_projects`

`check_all` is the sole interactive batch health-check operation.

## Azure removal boundary

### Delete active implementation

- delete `src/azure-devops.ts`;
- delete Azure schemas, types, registry functions, PAT encryption helpers, and timeout configuration;
- delete Azure-specific unit tests and test fixtures;
- delete root Azure Pipelines configuration and `.azure/` templates;
- remove Azure tools and environment variables from package and MCP registry metadata;
- remove Azure references from active documentation, skills, repository agent instructions, and architecture diagrams.

### Database migration

Migration history remains append-only. Existing migration versions are not rewritten because deployed databases may already record them.

Add a new migration that:

1. drops Azure pipeline indexes if present;
2. drops `pipeline_runs` if present;
3. drops `azure_pipelines` if present.

This intentionally removes obsolete credentials and pipeline history during upgrade. New databases may briefly create the historical tables while replaying migrations, then remove them in the final migration. Tests must prove upgrade and fresh-database behavior.

Historical release notes may mention previously shipped Azure support. Active documentation and generated API references must not advertise it.

## Bounded concurrency

Extract a generic helper into a focused module. It must:

- accept an ordered item list and maximum concurrency;
- never run more than the configured number of workers;
- preserve output order independently of completion order;
- capture each worker failure as a rejected result without cancelling queued items;
- return immediately for an empty list.

The scheduler and `check_all` use this helper with `HEALTH_MONITOR_MAX_CONCURRENCY`. Scheduler behavior remains failure-isolated. Interactive output gains `max_concurrency` and a stable saturation summary when the number of targets exceeds the limit.

## Agent-facing errors and descriptions

Introduce a stable JSON error envelope for expected tool failures:

```json
{
  "ok": false,
  "error": {
    "code": "SERVER_NOT_FOUND",
    "message": "Server is not registered: example",
    "remediation": "Run register_server first, then retry the operation.",
    "retryable": false
  }
}
```

Required codes:

- `SERVER_NOT_FOUND`
- `NO_SERVERS_REGISTERED`
- `STDIO_DISABLED`
- `STDIO_COMMAND_REJECTED`

Unexpected runtime failures continue to become health-check results for batch operations and internal MCP errors where appropriate. Tool descriptions explicitly distinguish:

- Streamable HTTP: remote URL ending at the MCP endpoint;
- SSE: legacy URL and compatibility-only use;
- stdio: local process execution, disabled unless explicitly allowed.

Tests assert the important codes and remediation strings.

## Documentation and runtime alignment

- add `.mise.toml` pinning Node 24.18.0 and pnpm 11.0.9;
- use `npx -y health-monitor-mcp` in noninteractive examples;
- make `ROADMAP.md` list the live milestone order and current scope;
- update README, usage, operations, security, architecture, agent skills, and package metadata to describe MCP-only monitoring;
- remove no-op or deleted Azure environment variables;
- document `HEALTH_MONITOR_MAX_CONCURRENCY` as applying to scheduler and interactive batches;
- use a persistent Docker volume mounted at `/data` in the primary example;
- keep TypeDoc output generated only by the existing workflow.

## Release integrity

The consolidated PR carries the 1.1.0 version update. Version-bearing files must agree:

- `package.json`
- `.release-please-manifest.json`
- `mcp.json`
- `server.json`
- `CHANGELOG.md`

Release workflow changes must:

- use `RELEASE_PLEASE_TOKEN` for Release Please so downstream release workflows can run;
- verify every publication checkout is exactly `health-monitor-mcp-v1.1.0` and that the tag points at `HEAD`;
- trigger npm publication from the published GitHub Release while retaining `npm-production` environment approval;
- trigger MCP Registry publication only after the npm workflow succeeds;
- build GHCR from the release tag and verify the exact tag/commit before pushing;
- preserve manual recovery dispatch paths;
- keep release assets, checksums, CycloneDX/SPDX SBOMs, and provenance verification.

The existing Release Please PR #85 is superseded by the consolidated PR and must be closed before merge. After merge, create/publish the component tag and GitHub Release from the merged commit, approve the npm deployment, and verify npm, GHCR, MCP Registry, release assets, and provenance before closing #77.

## Files and compatibility

The public package intentionally removes four Azure-related tools and Azure environment variables. This is a breaking capability removal inside a minor release because the user has explicitly retired Azure from the project. The changelog must call this out clearly.

SQLite server registrations, health history, alerts, and reports remain compatible. Azure credentials and pipeline history are deleted by migration.

## Testing

Required focused tests:

- migration upgrade drops Azure tables and indexes;
- fresh database contains no Azure tables after migrations;
- registered tool list contains only the ten supported tools;
- removed Azure tool names are absent from metadata and packaged smoke output;
- bounded helper preserves order and concurrency cap under success and failure;
- scheduler and `check_all` use the shared limit;
- structured error codes and remediation hints are stable;
- release ref verifier accepts only synchronized metadata and a tag pointing at `HEAD`;
- workflow policy tests enforce release-event sequencing.

Required final gates:

```bash
pre-commit run --all-files --hook-stage pre-commit
pnpm run ci
pnpm run test:integration
pnpm run package:dry-run
pnpm run check:metadata
actionlint
zizmor .github/workflows
```

GitHub checks and bot/agent feedback must be reviewed before merge, including CI, Semgrep, Snyk, SonarQube Cloud, CodeQL, Socket, dependency review, Renovate config, repository policy, and unresolved review threads.

## Issue outcomes

- #39: close as obsolete because Azure DevOps support is removed.
- #51: close when structured errors, descriptions, examples, and tests pass.
- #53: close when runtime/docs/metadata/Docker acceptance criteria pass.
- #78: close when the shared concurrency helper is used by scheduler and `check_all` with tests.
- #77: close only after the merged commit is published and verified on every required surface.

Issues #36, #37, #38, #40, #41, #42, #47, #48, #49, #50, and #79 remain open because they require independent product, architecture, provider, or external signing work.
