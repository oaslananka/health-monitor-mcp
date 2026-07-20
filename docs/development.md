# Development

## Runtime Requirements

- Node.js 24 LTS or newer
- pnpm 11 or newer through Corepack

Use pnpm through Corepack:

```bash
corepack enable
corepack prepare pnpm@11.0.9 --activate
pnpm install --frozen-lockfile
pnpm run setup:security
python3 -m venv .venv-security
. .venv-security/bin/activate
python -m pip install -r requirements-security.txt
pre-commit install --hook-type pre-commit
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

The staged dependency and scanner setup is documented in
[security-tooling.md](security-tooling.md).

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
pnpm run test:ci
pnpm run build
pnpm run check:metadata
pnpm run check:package
pnpm run release:dry-run
pnpm run security:semgrep
pre-commit run --all-files --hook-stage pre-commit
```

## Coverage and Test Reports

`pnpm run test:ci` runs the complete Jest suite once and writes:

- `coverage/lcov.info` for Codecov coverage ingestion;
- `reports/junit/junit.xml` for Codecov Test Analytics and failed-test reporting.

Both directories are generated and ignored by Git. `pnpm run test:coverage` remains available for a
normal local coverage run without the JUnit reporter. The same Jest thresholds remain blocking in
both commands.

`better-sqlite3` and the exact pinned Snyk CLI are the only approved install-time build
dependencies listed in `pnpm-workspace.yaml`. Snyk downloads its checksum-verified platform binary
during installation.
