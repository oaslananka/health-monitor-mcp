# Release

Release automation uses release-please manifest mode. Versions are derived from Conventional
Commits and synchronized through:

- `package.json`
- `mcp.json`
- `server.json`
- `.release-please-manifest.json`
- `CHANGELOG.md`

Manual version inputs, manual tags, and local package publishing are not part of the release path.
The unpublished `mcp-health-monitor@1.0.3` version is intentionally skipped because npm registry
policy does not allow reusing a previously published version after unpublish.

## Publish Gate

Production npm publishing is guarded by `.github/workflows/publish-npm.yml`:

- canonical repository guard
- `npm-production` environment approval
- exact `APPROVE_RELEASE` workflow input
- `pnpm run ci`
- `scripts/release-state.mjs --require-tag` with `safe_to_publish=true`, which requires a clean
  tracked worktree, an existing release tag for the package version, and an unpublished npm version
- npm trusted publishing/provenance through GitHub OIDC

Configure the npm trusted publisher for package `mcp-health-monitor` with:

- Repository: `oaslananka/health-monitor-mcp`
- Workflow: `.github/workflows/publish-npm.yml`
- Environment: `npm-production`
- Allowed action: `npm publish`

No Docker/GHCR, MCP Registry, marketplace, Cloudflare, or external connector publish is
configured in this repository.
