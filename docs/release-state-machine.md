# Release State Machine

`scripts/release-state.mjs` inspects synchronized local metadata, the component tag, the tracked worktree, and npm registry state. It does not publish.

## States

- `no-release`: no matching component tag and no published npm version.
- `tag-created`: `health-monitor-mcp-v${version}` or the legacy `v${version}` tag exists.
- `npm-published`: the exact package version is visible on npm.
- `dirty`: tracked files differ from `HEAD`.
- `blocked`: one or more publication blockers exist.

## Blockers

The script blocks when:

- package, MCP, server, npm package, or release manifest versions differ;
- MCP/package identities differ;
- `--require-tag` is used and the release tag is missing;
- tracked files are dirty;
- the exact npm version already exists.

The npm workflow treats an already-published version as idempotent only when it is the sole blocker and `scripts/verify-npm-package.mjs` confirms the registry tarball SRI and normalized package file contents. Local and registry tar archive metadata may differ without changing package contents.

## Exact Commit Gate

`release-state.mjs` proves tag presence; `scripts/verify-release-ref.mjs` proves that the expected component tag points at the current checkout. Publication workflows require both checks where applicable.

## Public Surfaces

The state report declares configured publication surfaces:

- npm
- GitHub Release
- GHCR
- official MCP Registry

External verification after release remains mandatory because registry and package visibility are remote states.

## Commands

Before the tag exists:

```bash
node scripts/release-state.mjs --dry-run
```

On a tagged publication checkout:

```bash
node scripts/release-state.mjs --require-tag
pnpm run release:verify-ref -- --tag health-monitor-mcp-v1.1.0
```

A safe local state does not authorize local publication. The next action is always a protected GitHub workflow.
