# Dependency Automation and Security Tooling

This repository uses layered controls so fast local feedback does not depend on cloud credentials,
while authenticated platform scans still protect pull requests and the default branch.

## Tooling Matrix

| Control                        | Local stage                               | Pull request / default branch                                  |
| ------------------------------ | ----------------------------------------- | -------------------------------------------------------------- |
| Renovate                       | `renovate-config-validator renovate.json` | Renovate GitHub App and Dependency Dashboard                   |
| Semgrep repository policy      | pre-commit                                | Repository Policy CI job                                       |
| Semgrep AppSec Platform        | not required locally                      | `Semgrep` workflow with `SEMGREP_APP_TOKEN`                    |
| Snyk Open Source               | optional pre-push                         | Existing Snyk GitHub App check                                 |
| Sonar Secrets                  | optional pre-push                         | Local prevention layer; GitHub secret scanning remains enabled |
| SonarQube Cloud                | IDE / automatic analysis                  | Existing SonarQube Cloud GitHub App quality gate               |
| CodeQL                         | CI only                                   | Primary GitHub-native SAST and SARIF gate                      |
| actionlint and zizmor          | pre-commit                                | Workflow Security and Repository Policy jobs                   |
| Codecov                        | generated LCOV and JUnit files            | Informational project/patch coverage and Test Analytics        |
| Trivy                          | not required locally                      | High/critical vulnerability scan of the built container image  |
| Gitleaks and dependency review | CI only                                   | Existing GitHub Actions jobs                                   |

## Install Deterministic Pre-Commit Hooks

Node.js 24 and pnpm 11 must already be available through Corepack. Install the pinned Python
framework and the default hook:

```bash
python3 -m venv .venv-security
. .venv-security/bin/activate
python -m pip install -r requirements-security.txt
pre-commit install --hook-type pre-commit
pre-commit run --all-files --hook-stage pre-commit
```

The default hook requires no SaaS token. It checks whitespace, EOF markers, YAML, JSON, TOML, mixed
line endings, merge markers, private keys, large files, GitHub Actions syntax and security, repository
Semgrep rules, formatting, source/test lint, and TypeScript types.

`.venv-security/` is local-only and must not be committed. Use any equivalent isolated Python
environment if preferred.

## Install Authenticated Pre-Push Hooks

Maintainers who want cloud-backed checks before every push can additionally install:

```bash
pre-commit install --hook-type pre-push
```

This enables Snyk Open Source and Sonar Secrets. It does not replace the default pre-commit hook;
install both hook types when both layers are desired.

### Snyk

The project pins the Snyk CLI in `devDependencies`. Authenticate locally with OAuth:

```bash
corepack pnpm exec snyk auth
corepack pnpm run security:snyk
```

For non-interactive automation, set `SNYK_TOKEN` rather than writing a token into the repository.
The repository's Snyk GitHub App remains the authoritative pull-request check; no duplicate Snyk
Actions workflow is maintained.

### Published npm consumer graph

`@modelcontextprotocol/sdk@1.29.0` declares an `@hono/node-server` 1.x range that cannot resolve past
`GHSA-frvp-7c67-39w9`. Until the upstream SDK widens that range, pnpm applies the repository patch in
`patches/@modelcontextprotocol__sdk@1.29.0.patch` and npm publication bundles the patched SDK graph.
`pnpm run check:consumer-package` installs the produced tarball into a clean npm project, verifies the
patched dependency declarations and versions, runs `npm ls`, and requires a zero-vulnerability
consumer audit. This protects public consumers rather than relying only on root-level pnpm overrides.

### Sonar Secrets

Create a SonarQube Cloud user token and expose it only in the local shell or a trusted secret
manager:

```bash
export SONAR_SECRETS_AUTH_URL=https://sonarcloud.io
export SONAR_SECRETS_TOKEN='<token>'
pre-commit run sonar-secrets --hook-stage pre-push --all-files
```

Sonar Secrets is early-access software. The hook is pinned to an exact release and is installed only
for maintainers who opt in to the authenticated pre-push stage.

## Semgrep

Repository-local, high-confidence rules live in `.semgrep.yml`. Run them directly with the pinned
local Semgrep version:

```bash
corepack pnpm run security:semgrep
```

The `Semgrep` GitHub Actions workflow uses a version-and-digest-pinned official container and the
repository's `SEMGREP_APP_TOKEN`. It runs diff-aware AppSec Platform scans for trusted pull requests,
full scans on `main`, manual dispatches, and a weekly schedule. Fork and Dependabot pull requests do
not receive repository secrets and are therefore skipped by the authenticated job; deterministic
Semgrep policy still runs in the Repository Policy CI job.

## Codecov

The CI validation job generates `coverage/lcov.info` and `reports/junit/junit.xml`, then uploads both
through `codecov/codecov-action` v7 pinned to an immutable commit. The second invocation uses
`report_type: test_results`, avoiding the separate Node 20-based test-results action while retaining
failed-test and flaky-test analytics.

`codecov.yml` keeps project and patch checks informational during adoption. Both use `target: auto`
with a 1% threshold; local Jest thresholds remain the deterministic blocking gate. Validate changes
with:

```bash
curl --fail --data-binary @codecov.yml https://codecov.io/validate
```

The repository uses the existing `CODECOV_TOKEN` Actions secret and does not grant OIDC permissions to
the validation job. Bundle Analysis is deferred because the project has no Rollup, Vite, or Webpack
application bundle.

## Trivy

The required `Docker Build` job builds `health-monitor-mcp:ci` and scans that exact local image with
Trivy. The scan is limited to fixed `HIGH` and `CRITICAL` vulnerabilities and uploads SARIF to GitHub
Code Scanning even when the vulnerability gate fails. Secret scanning is deliberately excluded from
Trivy because GitHub push protection and Gitleaks already own that responsibility.
The final runtime stage removes npm, npx, Corepack, pnpm, and Yarn. Build tooling stays in the
builder stage, preventing package-manager dependencies and caches from becoming production attack
surface.

The Trivy action, its nested setup action, and Codecov are pinned to full commit SHAs and explicitly
allowed by the repository selected-actions policy. Renovate manages future action and pre-commit pin
updates.

## SonarQube Cloud

SonarQube Cloud automatic analysis is currently enabled through the GitHub App. The repository file
`.sonarcloud.properties` limits analysis to `src` and `test` and sets UTF-8 encoding.

Automatic analysis cannot import Jest LCOV coverage or external issue reports. Codecov owns coverage
trend and patch reporting, so SonarQube Cloud is not configured as a second coverage gate. Do not add
a SonarScanner GitHub Actions job while automatic analysis remains enabled, because SonarQube Cloud
allows only one analysis method. A future CI-based migration must first disable automatic analysis
in the SonarQube Cloud project settings and explicitly retire the duplicate coverage responsibility.

## Renovate

`renovate.json` extends Renovate's best-practice preset and adds repository-specific controls:

- three-day release-age protection for normal npm, Actions, and container updates;
- immediate vulnerability remediation;
- digest pinning and digest-only automerge after required checks;
- dashboard approval for majors, Node changes, and monitoring runtime dependencies;
- grouping for TypeScript tooling, GitHub Actions, containers, and repository security tools;
- beta pre-commit manager support for pinned hook revisions;
- only labels from this repository's documented taxonomy.

Validate changes before opening a pull request:

```bash
renovate-config-validator renovate.json
```

Renovate owns issue #30, the Dependency Dashboard. Use its manual-run checkbox after changing
managers or manifests, then verify that the detected dependency inventory has refreshed.

## Bypass Policy

Use `SKIP=<hook-id>` only when a hook is unavailable for a documented environmental reason. Record
the skipped hook and equivalent validation evidence in the pull request. Never bypass private-key,
secret, Semgrep, or Snyk findings merely to make a commit or push succeed.

Emergency Git hook bypass with `--no-verify` does not bypass GitHub branch protection, Semgrep,
Snyk, SonarQube Cloud, CodeQL, dependency review, or the main CI checks.
