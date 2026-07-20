# Dependency Automation and Security Tooling

This repository uses layered controls so fast local feedback does not depend on cloud credentials,
while authenticated platform scans still protect pull requests and the default branch.

## Tooling Matrix

| Control | Local stage | Pull request / default branch |
| --- | --- | --- |
| Renovate | `renovate-config-validator renovate.json` | Renovate GitHub App and Dependency Dashboard |
| Semgrep repository policy | pre-commit | Repository Policy CI job |
| Semgrep AppSec Platform | not required locally | `Semgrep` workflow with `SEMGREP_APP_TOKEN` |
| Snyk Open Source | optional pre-push | Existing Snyk GitHub App check |
| Sonar Secrets | optional pre-push | Local prevention layer; GitHub secret scanning remains enabled |
| SonarQube Cloud | IDE / automatic analysis | Existing SonarQube Cloud GitHub App quality gate |
| CodeQL, Gitleaks, dependency review | CI only | Existing GitHub Actions jobs |

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

The default hook requires no SaaS token. It checks whitespace, EOF markers, YAML, JSON, merge
markers, private keys, large files, repository Semgrep rules, formatting, source/test lint, and
TypeScript types.

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

## SonarQube Cloud

SonarQube Cloud automatic analysis is currently enabled through the GitHub App. The repository file
`.sonarcloud.properties` limits analysis to `src` and `test` and sets UTF-8 encoding.

Automatic analysis cannot import Jest LCOV coverage or external issue reports. Do not add a
SonarScanner GitHub Actions job while automatic analysis remains enabled, because SonarQube Cloud
allows only one analysis method. A future CI-based migration must first disable automatic analysis
in the SonarQube Cloud project settings, then add an authenticated scanner and
`coverage/lcov.info` reporting in one reviewed change.

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
