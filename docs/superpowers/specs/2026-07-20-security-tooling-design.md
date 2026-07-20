# Dependency Automation and Security Tooling Design

**Issue:** #81 — Harden Renovate, pre-commit security gates, and repository analysis integrations
**Date:** 2026-07-20
**Status:** Approved by maintainer direction

## Problem

The repository already has a solid CI baseline and active Renovate, Snyk, and SonarQube Cloud integrations, but the controls are fragmented. Renovate references labels that do not exist, its dashboard is stale, Semgrep has a repository secret but no workflow, and the existing pre-commit configuration covers only formatting, linting, and type checking. Snyk and SonarQube Cloud provide pull-request feedback, but there is no repository-defined path for maintainers to run equivalent early checks before pushing.

## Goals

- Keep Renovate active, valid, low-noise, and aligned with the repository label taxonomy.
- Allow Renovate to maintain pre-commit hooks and security-tool versions.
- Add deterministic pre-commit checks that work without cloud credentials.
- Add optional authenticated pre-push checks for Snyk and Sonar Secrets.
- Add Semgrep AppSec Platform scanning in GitHub Actions using the existing secret.
- Keep SonarQube Cloud automatic analysis enabled while defining source/test scope in-repository.
- Preserve existing Snyk and SonarQube Cloud GitHub App checks rather than duplicating them.

## Non-goals

- Migrating SonarQube Cloud to CI-based analysis in this change. Automatic and CI-based analysis conflict, and disabling automatic analysis requires an external project setting change.
- Replacing CodeQL, Gitleaks, dependency review, npm audit, or existing supply-chain gates.
- Making cloud-authenticated hooks mandatory for all external contributors.
- Adding broad, noisy Semgrep registry packs to every local commit.

## Architecture

### Renovate

`renovate.json` will extend `config:best-practices`, retain repository-specific concurrency and approval controls, opt in to the beta pre-commit manager, and use only labels that already exist. Security updates remain immediate and bypass the normal release-age delay. Major, runtime, and Node changes continue to require explicit dashboard approval.

A dedicated CI job will validate `renovate.json` with a pinned `renovate/renovate` container. Container version and digest are themselves visible to Renovate through the GitHub Actions manager.

### Pre-commit

The default pre-commit stage will remain deterministic and credential-free:

- standard file hygiene hooks;
- repository formatting, source/test linting, and type checking;
- a pinned Semgrep hook using `.semgrep.yml` local rules.

Authenticated checks are defined for the pre-push stage but are not installed by the default `pre-commit install` command. Maintainers can opt in with `pre-commit install --hook-type pre-push`:

- Snyk Open Source via the pinned project dev dependency;
- Sonar Secrets via SonarSource's pinned beta pre-commit hook.

This avoids forcing casual contributors to create cloud accounts while giving maintainers an enforceable early gate.

### Semgrep

Local Semgrep rules will focus on repository-specific, high-confidence invariants:

- runtime source must not write to stdout except the documented CLI version entrypoint;
- Node child processes must not enable `shell: true`;
- dynamic code execution through `eval` or `new Function` is forbidden;
- complete environment objects must not be passed into structured logging.

GitHub Actions will additionally run `semgrep ci` using the existing `SEMGREP_APP_TOKEN`, enabling the AppSec Platform's configured rules, diff-aware pull-request scanning, and scheduled full scans. The official image will be pinned by version and multi-architecture digest.

### Snyk

The existing Snyk GitHub App remains the authoritative pull-request integration. The repository adds a pinned Snyk CLI dev dependency and a `security:snyk` script for authenticated local/pre-push Open Source scanning at high severity or above. No duplicate Snyk Actions workflow will be added.

### SonarQube Cloud

The current automatic analysis remains active. `.sonarcloud.properties` will define `src` as source, `test` as tests, UTF-8 encoding, and exclusions for generated artifacts. Jest coverage cannot be imported by automatic analysis; a later migration to CI-based scanning must first disable automatic analysis in the SonarQube Cloud project settings.

Sonar Secrets is added as an opt-in authenticated pre-push hook. It requires a SonarQube Cloud user token in `SONAR_SECRETS_TOKEN` and `SONAR_SECRETS_AUTH_URL=https://sonarcloud.io`.

## Files

- Modify `renovate.json` for best-practice presets, existing labels, and pre-commit opt-in.
- Replace `.pre-commit-config.yaml` with staged deterministic and authenticated hooks.
- Add `.semgrep.yml` and `.semgrepignore`.
- Add `.sonarcloud.properties`.
- Add `requirements-security.txt` containing the pinned pre-commit framework.
- Modify `package.json` and `pnpm-lock.yaml` for Snyk and helper scripts.
- Modify `.github/workflows/ci.yml` to run pre-commit policy and Renovate validation jobs.
- Add `.github/workflows/semgrep.yml`.
- Add `docs/security-tooling.md` and update contributor-facing documentation links.

## Error Handling

- Deterministic pre-commit findings fail commits.
- Semgrep AppSec findings follow Semgrep Platform blocking policy and fail the workflow when configured as blocking.
- Missing Snyk or Sonar authentication fails only the explicitly installed pre-push hook with setup instructions.
- Renovate validation failures block CI.
- Sonar automatic analysis remains the GitHub App responsibility; no scanner workflow is introduced while automatic analysis is enabled.

## Testing

1. Validate the unchanged Renovate config as baseline.
2. Add configuration tests and run them before implementation where practical.
3. Run `pre-commit validate-config`.
4. Run all deterministic hooks against all files.
5. Run local Semgrep rules against source and tests.
6. Run the Renovate validator in the pinned container or equivalent pinned CLI.
7. Verify Snyk CLI installation and rely on the existing authenticated GitHub App for the PR scan.
8. Run `pnpm run ci:check` and workflow security linters.
9. Open a PR and require CI, Semgrep, Snyk, and SonarQube Cloud checks to pass.

## Rollout

After merge, trigger the Renovate Dependency Dashboard manual run checkbox and verify that it detects `.pre-commit-config.yaml`, `requirements-security.txt`, the Semgrep/validator container versions, npm dependencies, Dockerfile images, and GitHub Actions. The dashboard body must reflect current manifests rather than the stale 2026-07-07 snapshot.
