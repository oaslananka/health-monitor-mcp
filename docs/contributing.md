# Contributing

## Setup

```bash
corepack enable
corepack prepare pnpm@11.14.0 --activate
pnpm install --frozen-lockfile
pnpm run build
python3 -m venv .venv-security
. .venv-security/bin/activate
python -m pip install -r requirements-security.txt
pre-commit install --hook-type pre-commit
pnpm test
pnpm run test:integration
```

## Standards

- TypeScript strict mode is required
- Do not use `any` in `src/`
- Add or update tests for every new tool or behavior change
- Update `CHANGELOG.md` for user-visible changes
- Run `pre-commit run --all-files --hook-stage pre-commit` and `pnpm run ci` before opening a PR
- Use the issue forms for bugs, feature requests, release blockers, and governance gaps
- Follow the label, triage, support, and response policies in [governance.md](governance.md)
- Follow the staged scanner and bypass policy in [security-tooling.md](security-tooling.md)
- Ask usage questions in GitHub Discussions instead of opening a tracking issue

## Commit Convention

Examples:

- `feat(report): add markdown health report tool`
- `fix(registry): remove dashboard N+1 queries`
- `docs: clarify PAT encryption behavior`
- `chore(ci): switch pipelines to pnpm`

## PR Checklist

- [ ] `pre-commit run --all-files --hook-stage pre-commit` passes
- [ ] `pnpm run ci` passes
- [ ] New tests were added or existing tests were updated
- [ ] `CHANGELOG.md` was updated for notable changes
- [ ] `README.md` was updated if a tool API or runtime workflow changed
- [ ] The PR links the issue it resolves
- [ ] Evidence for public artifacts, package publication, or docs updates is included when relevant
