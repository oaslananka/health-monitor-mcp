# Changelog

All notable changes to this project will be documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

## [1.0.0](https://github.com/oaslananka/health-monitor-mcp/compare/health-monitor-mcp-v1.0.0...health-monitor-mcp-v1.0.0) (2026-05-26)


### Bug Fixes

* **ci:** restore typecheck and security audit ([79d4d37](https://github.com/oaslananka/health-monitor-mcp/commit/79d4d379edebba5e97ba4c84a5aa4b8c3408c9c3))
* **release:** restore publishable package path ([fc55051](https://github.com/oaslananka/health-monitor-mcp/commit/fc55051fbe7f347e583fa22ad7cb4016031356f4))
* **security:** remove shell quoting from prepublish check ([decdcaf](https://github.com/oaslananka/health-monitor-mcp/commit/decdcaf700d10dc7638ed31757a258b96ea4d62c))

## [Unreleased]

## [1.0.0] - 2026-05-26

### Added

- Core MCP monitoring tools: `register_server`, `check_server`, `check_all`, `get_uptime`,
  `get_dashboard`, `get_report`, `list_servers`, `unregister_server`, `set_alert`, and
  `get_monitor_stats`.
- Azure DevOps pipeline monitoring tools: `register_azure_pipelines`, `check_pipeline_status`,
  `get_pipeline_logs`, and `check_all_projects`.
- SQLite-backed server registry, health history, alert thresholds, pipeline metadata, migrations,
  WAL mode, retention pruning, and pipeline run deduplication.
- Streamable HTTP, SSE, and stdio health checks with bounded timeouts, retry/backoff handling,
  and latency percentile reporting.
- Optional background scheduler with configurable concurrency.
- HTTP MCP endpoint with `/health`, bearer-token authentication, and remote-safe runtime profile.
- Docker packaging, MCP metadata, generated API docs, ADRs, governance templates, support policy,
  and release evidence documentation.
- GitHub Actions CI, release asset generation, CodeQL, workflow linting, secret scanning, SBOM,
  license, REUSE, package dry-run, release-state, and review-thread gates.

### Changed

- Established `health-monitor-mcp` as the canonical public npm package name for the first public
  registry release.
- Kept `mcp-health-monitor` only as a backwards-compatible CLI binary alias.
- Standardized package management on pnpm 11 with Node 24 CI while keeping package runtime support
  declared as Node `>=20`.
- Configured release automation for GitHub Actions and npm trusted publishing with provenance.

### Security

- Encrypt Azure DevOps PAT tokens with AES-256-GCM when `HEALTH_MONITOR_ENCRYPTION_KEY` is set.
- Require explicit opt-in for insecure local PAT storage and legacy PAT decoding migration paths.
- Disable raw stdio process execution in remote HTTP profiles unless trusted local stdio is
  explicitly enabled.
- Minimize workflow permissions and pin GitHub Actions to reviewed commit SHAs.
