# Development

Use pnpm through Corepack:

```bash
corepack enable
corepack prepare pnpm@11.0.9 --activate
pnpm install --frozen-lockfile
pnpm run setup:security
```


## Local Security Tooling

The full local `pnpm run ci` path runs REUSE/SPDX compliance checks. Install the pinned REUSE
version once before running the full gate:

```bash
pnpm run setup:security
pnpm run security:supply-chain
```

The script installs `reuse==6.2.0` with Python user-site packages, matching the GitHub Actions
workflow. If your shell cannot find user-site console scripts, `pnpm run security:reuse` still uses
`python -m reuse lint` directly.

Common local gates:

```bash
pnpm run ci
pnpm run format:check
pnpm run lint
pnpm run lint:test
pnpm run typecheck
pnpm run docs:api
pnpm run docs:api:check
pnpm test
pnpm run test:integration
pnpm run test:coverage
pnpm run build
pnpm run check:metadata
pnpm run check:package
pnpm run release:dry-run
```

`better-sqlite3` is the only approved install-time build dependency and is listed in
`pnpm-workspace.yaml`.
