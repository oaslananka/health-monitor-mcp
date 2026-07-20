# Changelog

All notable changes to this project will be documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

## [Unreleased]

## [1.1.0] - 2026-07-21

### Removed

- Removed Azure DevOps pipeline registration, status, log retrieval, and combined-project tools.
- Removed Azure-specific CI templates, runtime configuration, package metadata, tests, PAT encryption code, and active documentation.
- Added migration v4 to delete retired Azure pipeline registrations, credentials, indexes, and run history during upgrade.

### Added

- Added ordered bounded concurrency shared by scheduled checks and interactive `check_all` operations.
- Added stable agent error envelopes with remediation for missing servers, empty registries, disabled stdio, and rejected stdio commands.
- Added repository-local Node.js 24.18.0 and pnpm 11.0.9 runtime pins.
- Added exact release-tag and commit verification for release assets, npm, GHCR, and MCP Registry publication.

### Changed

- Reduced the public MCP surface to ten focused server-health tools.
- Updated package, plugin, agent runtime, skill, Docker, security, operations, architecture, and roadmap documentation for MCP-only monitoring.
- `HEALTH_MONITOR_MAX_CONCURRENCY` now applies to both scheduled and interactive batch checks while preserving deterministic result order.
- Raised the declared runtime floor to Node.js 24 and aligned CI/release jobs to Node.js 24.18.0.

### Fixed

- Prevented application logs from corrupting MCP stdio protocol output.
- Bounded inbound HTTP request-body memory and read time, including early `413` and slow-body `408` responses.
- Made PAT tampering regression coverage deterministic before removing the retired credential feature.
- Hardened Renovate, pre-commit, Semgrep, Snyk, SonarQube Cloud, CodeQL, Socket, dependency review, and repository policy integration.
- Made release publication verify one exact component tag and commit across every public artifact.

### Security

- Removed the retired provider credential surface instead of retaining unused PAT storage and fetch logic.
- Kept local stdio disabled by default and returned actionable policy errors without exposing internal details.
- Preserved bearer authentication, Origin policy, bounded HTTP bodies, SBOMs, provenance, and checksum verification.

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
