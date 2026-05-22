# Contributing

## Setup

```bash
corepack enable
corepack prepare pnpm@11.0.9 --activate
pnpm install --frozen-lockfile
pnpm run build
pnpm test
pnpm run test:integration
```

## Standards

- TypeScript strict mode is required
- Do not use `any` in `src/`
- Add or update tests for every new tool or behavior change
- Update `CHANGELOG.md` for user-visible changes
- Run `pnpm run ci` before opening a PR

## Commit Convention

Examples:

- `feat(report): add markdown health report tool`
- `fix(registry): remove dashboard N+1 queries`
- `docs: clarify PAT encryption behavior`
- `chore(ci): switch pipelines to pnpm`

## PR Checklist

- [ ] `pnpm run ci` passes
- [ ] New tests were added or existing tests were updated
- [ ] `CHANGELOG.md` was updated for notable changes
- [ ] `README.md` was updated if a tool API or runtime workflow changed
