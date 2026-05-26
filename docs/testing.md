# Testing

The stable local interface is:

```bash
pnpm run ci
```

`ci` runs format, lint, typecheck, unit tests, integration tests, security audit, metadata
validation, package dry-run, and release-state dry-run.

Focused commands:

```bash
pnpm test
pnpm run test:integration
pnpm run test:coverage
pnpm run lint
pnpm run lint:test
pnpm run typecheck
pnpm run docs:api
pnpm run docs:api:check
```

Security-focused local checks:

```bash
actionlint
zizmor --offline --min-severity low .github/workflows
gitleaks detect --no-git --redact --source .
```
