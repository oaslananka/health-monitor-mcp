# Release

The repository publishes one protected component tag and commit across GitHub Release assets, npm, GHCR, and the official MCP Registry.

## Version Sources

Release metadata must remain identical in:

- `package.json`
- `.release-please-manifest.json`
- `mcp.json`
- `server.json`
- `server.json` npm package entry
- `.claude-plugin/plugin.json`
- `CHANGELOG.md`

Release Please uses manifest mode and creates tags such as `health-monitor-mcp-v1.1.0`. The action authenticates with `RELEASE_PLEASE_TOKEN`, not the default `GITHUB_TOKEN`, so a published GitHub Release can trigger downstream publication workflows.

## Exact Ref Verification

Every publication checkout fetches tags and runs:

```bash
pnpm run release:verify-ref -- --tag health-monitor-mcp-v1.1.0
```

`scripts/verify-release-ref.mjs` rejects publication unless:

1. package, MCP, server, npm package, and manifest versions match;
2. package and MCP identities match;
3. the supplied tag is exactly `health-monitor-mcp-v${version}`;
4. the tag exists;
5. the tag commit is exactly `HEAD`.

## Publication Sequence

1. Merge the reviewed release PR to protected `main`.
2. Release Please creates the component tag and GitHub Release. A maintainer may create the same exact tag/release manually only as a recovery action.
3. `Release` checks out the tag, verifies it, runs release checks, builds the tarball, generates SBOMs and checksums, attests provenance, uploads assets, downloads them again, and verifies the checksum.
4. `Publish GHCR Image` checks out and verifies the release tag, then publishes SBOM and provenance-enabled image tags.
5. `Publish npm` starts from `release.published`, waits for `npm-production` environment approval, checks out and verifies the release tag, runs the full CI gate, publishes with GitHub OIDC provenance, and verifies registry integrity.
6. `Publish npm` calls the reusable `Publish MCP Registry` workflow only after npm publication succeeds. The called workflow checks out and verifies the exact component tag, confirms the npm version is visible, signs in through GitHub OIDC, and publishes `server.json`.

Manual `workflow_dispatch` inputs remain available for idempotent recovery. They must reference an existing component tag and pass the same exact-ref verification.

## npm Production Gate

The npm workflow requires:

- canonical repository guard;
- `npm-production` environment approval;
- release event or exact `APPROVE_RELEASE` recovery input;
- clean tagged checkout;
- `pnpm run ci`;
- `scripts/release-state.mjs --require-tag`;
- npm trusted publishing and provenance;
- `scripts/verify-npm-package.mjs` integrity comparison.

If the exact version already exists, publication is skipped only when registry verification succeeds.

Configure npm trusted publishing with:

- Repository: `oaslananka/health-monitor-mcp`
- Workflow: `.github/workflows/publish-npm.yml`
- Environment: `npm-production`
- Allowed action: `npm publish`

## Release Evidence

The GitHub Release must contain:

- `health-monitor-mcp-<version>.tgz`
- `SHA256SUMS`
- `pack.json`
- `sbom.cyclonedx.json`
- `sbom.spdx.json`

GitHub artifact attestations cover the tarball. GHCR builds request native SBOM and provenance generation. npm publishes with `--provenance`.

## v1.1.0 Verification

```bash
gh release view health-monitor-mcp-v1.1.0
npm view health-monitor-mcp@1.1.0 version dist.integrity --json
node scripts/verify-npm-package.mjs
gh api repos/oaslananka/health-monitor-mcp/git/ref/tags/health-monitor-mcp-v1.1.0
```

Also verify:

- the GitHub Release target commit equals the tag commit;
- the GHCR `1.1.0` digest was built from that commit;
- the MCP Registry reports `io.github.oaslananka/health-monitor-mcp@1.1.0`;
- release checksums and SBOM files download and validate;
- no stale `release-please--*` branch remains after completion.

Local publication is not supported. Use GitHub workflows for all public artifacts.
