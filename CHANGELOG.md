# Changelog

All notable changes to this project will be documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

## [1.1.0](https://github.com/oaslananka/health-monitor-mcp/compare/health-monitor-mcp-v1.0.0...health-monitor-mcp-v1.1.0) (2026-07-20)


### Features

* add stateful HTTP MCP sessions ([#60](https://github.com/oaslananka/health-monitor-mcp/issues/60)) ([4de4dec](https://github.com/oaslananka/health-monitor-mcp/commit/4de4decff1d1b0f70653852141603f2afe5ea407))


### Bug Fixes

* **ci:** let Renovate manage validator image ([#83](https://github.com/oaslananka/health-monitor-mcp/issues/83)) ([65f07e0](https://github.com/oaslananka/health-monitor-mcp/commit/65f07e04558943b3d8683fb323e519d73ac56c1b))
* **deps:** clear security audit blockers ([62f9eaf](https://github.com/oaslananka/health-monitor-mcp/commit/62f9eaf99021e7eb8992863d878574b49cab9438))
* Fix CI test failures and update roadmap milestones ([#67](https://github.com/oaslananka/health-monitor-mcp/issues/67)) ([211a4af](https://github.com/oaslananka/health-monitor-mcp/commit/211a4af4bcd807f88e44924e9af1c3e24c28b5e5))
* **http:** bound MCP request body resources ([#86](https://github.com/oaslananka/health-monitor-mcp/issues/86)) ([10bfe4a](https://github.com/oaslananka/health-monitor-mcp/commit/10bfe4a2ba533051b8866ceeec6352676f42904b))
* preserve MCP stdio protocol integrity ([#80](https://github.com/oaslananka/health-monitor-mcp/issues/80)) ([c77a6c9](https://github.com/oaslananka/health-monitor-mcp/commit/c77a6c96667dd6a8bb025322514268c6473f295a)), closes [#74](https://github.com/oaslananka/health-monitor-mcp/issues/74)
* **security:** enforce HTTP origin policy ([54751ee](https://github.com/oaslananka/health-monitor-mcp/commit/54751ee0dbb94d60452279b46904e64edd3f1f2c))
* **security:** harden stdio monitoring policy ([438ea6f](https://github.com/oaslananka/health-monitor-mcp/commit/438ea6f79c034e93aceae05ac14c8815bc35408e))
* **security:** restrict authenticated Azure log URLs ([#84](https://github.com/oaslananka/health-monitor-mcp/issues/84)) ([32eee2f](https://github.com/oaslananka/health-monitor-mcp/commit/32eee2fae90b714b996469a1a0e03a40c5848d2e))

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

### Fixed

- Restored the publishable package path for the first public npm release.
- Restored CI typecheck and security audit gates.
- Removed shell quoting from the prepublish package-state check.

### Security

- Encrypt Azure DevOps PAT tokens with AES-256-GCM when `HEALTH_MONITOR_ENCRYPTION_KEY` is set.
- Require explicit opt-in for insecure local PAT storage and legacy PAT decoding migration paths.
- Disable raw stdio process execution in remote HTTP profiles unless trusted local stdio is
  explicitly enabled.
- Minimize workflow permissions and pin GitHub Actions to reviewed commit SHAs.
