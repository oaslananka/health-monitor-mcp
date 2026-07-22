# Changelog

All notable changes to this project will be documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

## [1.2.0](https://github.com/oaslananka/health-monitor-mcp/compare/health-monitor-mcp-v1.1.3...health-monitor-mcp-v1.2.0) (2026-07-22)


### Features

* add GitHub Actions workflow monitoring ([#101](https://github.com/oaslananka/health-monitor-mcp/issues/101)) ([eea54d9](https://github.com/oaslananka/health-monitor-mcp/commit/eea54d9b8e4a63981b50e2b5d546c0f732db1672))

## [1.1.3](https://github.com/oaslananka/health-monitor-mcp/compare/health-monitor-mcp-v1.1.2...health-monitor-mcp-v1.1.3) (2026-07-22)


### Bug Fixes

* **security:** secure the published npm dependency graph ([#99](https://github.com/oaslananka/health-monitor-mcp/issues/99)) ([977d6d1](https://github.com/oaslananka/health-monitor-mcp/commit/977d6d13f8c6f3b589e336e989e450c5408f4547)), closes [#96](https://github.com/oaslananka/health-monitor-mcp/issues/96)

## [1.1.2](https://github.com/oaslananka/health-monitor-mcp/compare/health-monitor-mcp-v1.1.1...health-monitor-mcp-v1.1.2) (2026-07-21)


### Bug Fixes

* **security:** patch transitive dependency advisories ([#97](https://github.com/oaslananka/health-monitor-mcp/issues/97)) ([42570cb](https://github.com/oaslananka/health-monitor-mcp/commit/42570cbd0c9bfb5cf8bf94c2b7cc8e8a158c826a)), closes [#96](https://github.com/oaslananka/health-monitor-mcp/issues/96)

## [1.1.1](https://github.com/oaslananka/health-monitor-mcp/compare/health-monitor-mcp-v1.1.0...health-monitor-mcp-v1.1.1) (2026-07-21)


### Bug Fixes

* **release:** make publication verification portable ([#94](https://github.com/oaslananka/health-monitor-mcp/issues/94)) ([f65ffc5](https://github.com/oaslananka/health-monitor-mcp/commit/f65ffc5f253cd2b59f98fb29ee51d8f34a153776)), closes [#93](https://github.com/oaslananka/health-monitor-mcp/issues/93)
* **docs:** keep generated API documentation independent of package patch versions

## [Unreleased]

### Fixed

- Enforced the official MCP Registry 100-character public description limit before release publication.

### Added

- Added GitHub Actions workflow registration, checks, failed job and step diagnostics, scheduling, dashboards, and reports.
- Added environment-only GitHub authentication: only `token_env` is persisted, while token values remain in runtime environment variables.

### Fixed

- Bundled the patched MCP SDK dependency graph so downstream npm consumers no longer resolve the vulnerable Hono Node adapter.
- Patched newly disclosed transitive dependency vulnerabilities in the MCP runtime and API documentation toolchain.
- Made npm release verification compare authenticated package contents instead of environment-dependent tarball metadata.
- Made reusable MCP Registry publication run for release callers by relying on validated workflow inputs.

## [1.1.0] - 2026-07-21

### Removed

- Removed Azure DevOps pipeline registration, status, log retrieval, and combined-project tools.
- Removed Azure-specific CI templates, runtime configuration, package metadata, tests, PAT encryption code, and active documentation.
- Added migration v4 to delete retired Azure pipeline registrations, credentials, indexes, and run history during upgrade.

### Added

- Added ordered bounded concurrency shared by scheduled checks and interactive `check_all` operations.
- Added stable agent error envelopes with remediation for missing servers, empty registries, disabled stdio, and rejected stdio commands.
- Added repository-local Node.js 24.18.0 and pnpm 11.14.0 runtime pins.
- Added exact release-tag and commit verification for release assets, npm, GHCR, and MCP Registry publication.
- Added Codecov LCOV and JUnit Test Analytics uploads while keeping local Jest thresholds blocking.
- Added high/critical Trivy scanning and SARIF reporting for the built container image.

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
- Refreshed the pinned Node 24 container base to current Debian security packages and removed npm, npx, Corepack, pnpm, and Yarn from the runtime stage.

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
