# Release

Release automation uses release-please manifest mode. Versions are derived from Conventional
Commits and synchronized through:

- `package.json`
- `mcp.json`
- `server.json`
- `.release-please-manifest.json`
- `CHANGELOG.md`

Manual version inputs, manual tags, and local package publishing are not part of the release path.

## Publish Gate

Production npm publishing is guarded by `.github/workflows/publish-npm.yml`:

- canonical repository guard
- `npm-production` environment approval
- exact `APPROVE_RELEASE` workflow input
- `pnpm run ci`
- `scripts/release-state.mjs` with `safe_to_publish=true`
- npm trusted publishing/provenance through GitHub OIDC

No Docker/GHCR, MCP Registry, marketplace, Cloudflare, or external connector publish is
configured in this repository.
