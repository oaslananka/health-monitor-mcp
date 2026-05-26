# Release

Release automation uses release-please manifest mode. Versions are derived from Conventional
Commits and synchronized through:

- `package.json`
- `mcp.json`
- `server.json`
- `.release-please-manifest.json`
- `CHANGELOG.md`

Manual version inputs, manual tags, and local package publishing are not part of the release path.
The unpublished `health-monitor-mcp@1.0.3` version is intentionally skipped because npm registry
policy does not allow reusing a previously published version after unpublish.

Release Please creates component-prefixed tags such as `health-monitor-mcp-v1.0.5`. The
release workflow also accepts `workflow_dispatch` inputs for `tag_name` and `version` so maintainers
can rerun asset generation for an existing GitHub Release if a previous asset upload failed after
the tag and release were already created.

## Publish Gate

Production npm publishing is guarded by `.github/workflows/publish-npm.yml`:

- canonical repository guard
- `npm-production` environment approval
- exact `APPROVE_RELEASE` workflow input
- `pnpm run ci`
- `scripts/release-state.mjs --require-tag` with `safe_to_publish=true`, which requires a clean
  tracked worktree, an existing release tag for the package version, and an unpublished npm version
- npm trusted publishing/provenance through GitHub OIDC

Release artifacts include:

- npm tarball
- `SHA256SUMS`
- `pack.json`
- CycloneDX and SPDX SBOMs

The release workflow downloads the uploaded assets back from GitHub and verifies the tarball
checksum before uploading the same evidence directory as a workflow artifact.

Configure the npm trusted publisher for package `health-monitor-mcp` with:

- Repository: `oaslananka/health-monitor-mcp`
- Workflow: `.github/workflows/publish-npm.yml`
- Environment: `npm-production`
- Allowed action: `npm publish`

No Docker/GHCR, MCP Registry, marketplace, Cloudflare, or external connector publish is
configured in this repository.
