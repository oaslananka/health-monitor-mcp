# Release

Release automation uses release-please manifest mode. Versions are derived from Conventional
Commits and synchronized through:

- `package.json`
- `mcp.json`
- `server.json`
- `.release-please-manifest.json`
- `CHANGELOG.md`

Manual version inputs, manual tags, and local package publishing are not part of the release path.
The npm package is not publicly installable as of 2026-05-26 because the package was unpublished
before the current release line. Keep user-facing install docs pointed at the verified GitHub
Release tarball until `npm view mcp-health-monitor version` succeeds for the current package
version.

Release Please creates component-prefixed tags such as `mcp-health-monitor-v1.0.5`. The
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

The v1.0.5 GitHub Release currently includes `mcp-health-monitor-1.0.5.tgz`, `SHA256SUMS`, and
`pack.json`.

The release workflow downloads the uploaded assets back from GitHub and verifies the tarball
checksum before uploading the same evidence directory as a workflow artifact.

Configure the npm trusted publisher for package `mcp-health-monitor` with:

- Repository: `oaslananka/health-monitor-mcp`
- Workflow: `.github/workflows/publish-npm.yml`
- Environment: `npm-production`
- Allowed action: `npm publish`

No Docker/GHCR, MCP Registry, marketplace, Cloudflare, or external connector publish is
configured in this repository.
