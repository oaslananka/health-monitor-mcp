# Development

Use pnpm through Corepack:

```bash
corepack enable
corepack prepare pnpm@11.0.9 --activate
pnpm install --frozen-lockfile
```

Common local gates:

```bash
pnpm run format:check
pnpm run lint
pnpm run lint:test
pnpm run typecheck
pnpm run docs:api
pnpm run docs:api:check
pnpm test
pnpm run test:integration
pnpm run build
pnpm run check:metadata
pnpm run check:package
pnpm run release:dry-run
```

`better-sqlite3` is the only approved install-time build dependency and is listed in
`pnpm-workspace.yaml`.
