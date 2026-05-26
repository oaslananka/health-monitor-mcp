# Changelog

All notable changes to this project will be documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

## [1.0.5](https://github.com/oaslananka/health-monitor-mcp/compare/health-monitor-mcp-v1.0.4...health-monitor-mcp-v1.0.5) (2026-05-26)

### Bug Fixes

- **ci:** restore typecheck and security audit ([79d4d37](https://github.com/oaslananka/health-monitor-mcp/commit/79d4d379edebba5e97ba4c84a5aa4b8c3408c9c3))
- **release:** restore publishable package path ([fc55051](https://github.com/oaslananka/health-monitor-mcp/commit/fc55051fbe7f347e583fa22ad7cb4016031356f4))
- **security:** remove shell quoting from prepublish check ([decdcaf](https://github.com/oaslananka/health-monitor-mcp/commit/decdcaf700d10dc7638ed31757a258b96ea4d62c))

## [Unreleased]

## [1.0.4] - 2026-05-26

### Added

- Added bearer-token authentication for the HTTP MCP endpoint with remote-safe profile checks
- Added AES-256-GCM Azure DevOps PAT encryption with explicit legacy migration controls
- Added bounded network timeouts for HTTP probes, Azure DevOps calls, and webhook delivery
- Added health-check retention pruning, Azure pipeline run dedupe, and scheduler concurrency limits
- Added release-please manifest configuration, release-state validation, metadata validation, and review-thread gate automation

### Changed

- Migrated package management and CI validation from npm lockfiles to pnpm 11
- Hardened Docker runtime defaults with a digest-pinned Node 24 base image and non-root runtime user
- Disabled raw stdio process execution in HTTP mode unless explicitly enabled for trusted local deployments
- Corrected release and publish automation guards to target `oaslananka/health-monitor-mcp`
- Updated public repository metadata and documentation links to the canonical GitHub repository

### Security

- Removed the manual Azure npm publish/tag path and guarded npm publishing behind GitHub environment approval and provenance

## [1.0.3] - 2026-04-08

### Fixed

- Upgraded `better-sqlite3` to `12.8.0` to avoid native install failures on Node 24 environments
- Eliminated `npx` startup failures caused by `better-sqlite3@9.4.3` fallback rebuild errors

## [1.0.2] - 2026-04-08

### Changed

- Refreshed the locked Hono runtime dependencies to patched releases that resolve the current GitHub Dependabot moderate advisories
- Updated the ESLint 9 toolchain to a patched release line that clears the current `@eslint/plugin-kit` advisory

### Security

- Resolved the `hono` cookie, IP restriction, path traversal, and `serveStatic` advisory set by moving to patched transitive versions
- Resolved the `@hono/node-server` `serveStatic` middleware bypass advisory
- Resolved the `@eslint/plugin-kit` ReDoS advisory through the patched ESLint 9 line

## [1.0.1] - 2026-04-08

### Added

- Database migration system for safe schema upgrades
- Markdown `get_report` tool for copy-pasteable health reporting
- P50 and P95 latency reporting in uptime and dashboard responses
- Optional scheduler for background checks through `HEALTH_MONITOR_AUTO_CHECK=1`
- `/health` HTTP endpoint plus in-memory rate limiting for the HTTP server
- Integration tests, scheduler tests, migration tests, retry tests, and HTTP server tests
- `SECURITY.md` with private vulnerability reporting guidance
- `ROADMAP.md`, `.env.example`, and `renovate.json` for repo governance and maintenance
- Internal webhook delivery helper with optional HMAC-SHA256 signing
- Official `server.json` manifest for MCP Registry publication

### Changed

- Switched HTTP serving to native `node:http`
- Removed `node-fetch` in favor of the Node 20 global fetch API
- Replaced per-server N+1 query patterns with aggregated registry reads
- Split TypeScript config into build and workspace/test variants
- Migrated linting to ESLint 9 flat config
- Updated publish metadata, Docker flow, and Azure/GitHub CI definitions
- Prepublish validation now enforces coverage with `npm run test:coverage`
- README and security documentation now use explicit GitHub-facing policy links
- Webhook docs now distinguish the internal helper from the still-planned public webhook tooling
- Registry-facing `mcpName` now uses the GitHub-auth namespace form `io.github.oaslananka/health-monitor-mcp`

### Security

- Clarified that Azure DevOps PAT storage is base64 encoding, not encryption
- Moved vulnerability disclosure policy to `SECURITY.md` and removed public issue guidance

## [1.0.0] - 2026-04-07

### Added

- Initial release: `register_server`, `check_server`, `check_all`, `get_uptime`, `get_dashboard`
- Azure DevOps pipeline monitoring: `register_azure_pipelines`, `check_pipeline_status`, `get_pipeline_logs`
- SQLite-backed health history with WAL mode
- Multi-transport support: Streamable HTTP, SSE, and stdio
- Alert thresholds for response time, uptime percentage, and consecutive failures
- Unit test suite, Docker packaging, and CI definitions
