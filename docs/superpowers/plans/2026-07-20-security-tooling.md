# Dependency Automation and Security Tooling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden Renovate and add staged local/CI security controls for Semgrep, Snyk, and SonarQube Cloud without duplicating existing GitHub App integrations.

**Architecture:** Deterministic checks run at pre-commit and in CI. Authenticated Snyk and Sonar Secrets checks are opt-in pre-push hooks. Semgrep AppSec runs in a pinned GitHub Actions container, while SonarQube Cloud stays on automatic analysis with repository-defined scope.

**Tech Stack:** Renovate 43, pre-commit 4, Semgrep 1.170, Snyk CLI 1.1306, Sonar Secrets 2.41, pnpm 11, GitHub Actions.

## Global Constraints

- Keep SonarQube Cloud automatic analysis enabled; do not add SonarScanner CI analysis.
- Keep the existing Snyk GitHub App pull-request integration; do not duplicate it in Actions.
- Use only existing repository labels in Renovate rules.
- Pin hook revisions, scanner versions, GitHub Action SHAs, and container digests.
- Default pre-commit hooks must not require cloud credentials.
- Authenticated checks run only when the maintainer explicitly installs the pre-push hook.
- Security findings fail instead of running in warning-only mode.

---

### Task 1: Add regression expectations for repository security policy

**Files:**
- Modify: `test/unit/quality-gates.test.ts`
- Test: `test/unit/quality-gates.test.ts`

**Interfaces:**
- Consumes: `readProjectText()` and `readProjectJson()` fixtures.
- Produces: Tests requiring Renovate validation, Semgrep CI, staged pre-commit hooks, Snyk script, and Sonar scope.

- [ ] Add a test asserting that `renovate.json` extends `config:best-practices`, enables pre-commit management, and contains no ad-hoc labels such as `javascript`, `runtime`, or `requires-review`.
- [ ] Add a test asserting `.pre-commit-config.yaml` includes standard hooks, Semgrep pre-commit, Snyk pre-push, and Sonar Secrets pre-push.
- [ ] Add a test asserting `.github/workflows/semgrep.yml`, `.semgrep.yml`, and `.sonarcloud.properties` contain the expected commands and paths.
- [ ] Add a test asserting package scripts include `security:semgrep`, `security:snyk`, and `precommit:run`.
- [ ] Run the focused test and verify it fails because the new policy files and scripts do not yet exist.
- [ ] Commit the failing regression tests.

### Task 2: Harden Renovate and make security tooling updateable

**Files:**
- Modify: `renovate.json`
- Create: `requirements-security.txt`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: Valid Renovate policy using existing labels, pre-commit manager opt-in, Python security tool tracking, and a pinned validator job.

- [ ] Replace redundant presets with `config:best-practices` plus repository-specific semantic and major-update controls.
- [ ] Enable the beta pre-commit manager explicitly.
- [ ] Replace all missing labels with existing `priority:*`, `area:*`, `risk:*`, and `needs:*` labels.
- [ ] Add `requirements-security.txt` with `pre-commit==4.6.0`.
- [ ] Add a `Repository Policy` CI job that runs deterministic pre-commit hooks.
- [ ] Add a `Renovate Config` CI job using `renovate/renovate:43.272.4@sha256:6aaa848f2e0660525a1a10bd6b24b8e5de806666915015eed1556a2b8eb283fc`.
- [ ] Validate `renovate.json` with Renovate 43.272.4.
- [ ] Commit Renovate and CI policy changes.

### Task 3: Add deterministic Semgrep and pre-commit controls

**Files:**
- Replace: `.pre-commit-config.yaml`
- Create: `.semgrep.yml`
- Create: `.semgrepignore`

**Interfaces:**
- Produces: Credential-free pre-commit hygiene and repository-local Semgrep enforcement.

- [ ] Add `pre-commit/pre-commit-hooks` v6.0.0 for whitespace, EOF, YAML/JSON, merge conflict, private-key, and large-file checks.
- [ ] Add `semgrep/pre-commit` v1.170.0 with local `.semgrep.yml`, strict mode, and error exit behavior.
- [ ] Preserve pnpm format, source/test lint, and typecheck local hooks.
- [ ] Add local Semgrep rules blocking runtime stdout writes outside `src/mcp.ts`, `shell: true`, `eval`, `new Function`, and logging of `process.env`.
- [ ] Exclude generated and dependency directories in `.semgrepignore`.
- [ ] Install pre-commit 4.6.0 in an isolated environment and run `pre-commit validate-config`.
- [ ] Run all pre-commit-stage hooks against all files and fix deterministic findings.
- [ ] Commit local security controls.

### Task 4: Add Snyk and Sonar pre-push controls

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `.pre-commit-config.yaml`
- Create: `.sonarcloud.properties`

**Interfaces:**
- Produces: Pinned Snyk CLI script, opt-in Snyk and Sonar Secrets pre-push hooks, and automatic-analysis scope.

- [ ] Add exact dev dependency `snyk@1.1306.1`.
- [ ] Add `security:snyk` using `snyk test --all-projects --severity-threshold=high`.
- [ ] Add `security:semgrep`, `precommit:install`, `precommit:install:push`, and `precommit:run` scripts.
- [ ] Add Snyk as a local pre-push hook.
- [ ] Add `SonarSource/sonar-secrets-pre-commit` at `v2.41.0.10709` as a pre-push hook.
- [ ] Add `.sonarcloud.properties` with `src`, `test`, UTF-8, and generated-artifact exclusions.
- [ ] Verify Snyk CLI version and pre-commit config installation without exposing credentials.
- [ ] Commit authenticated local-gate configuration.

### Task 5: Add Semgrep AppSec Platform CI

**Files:**
- Create: `.github/workflows/semgrep.yml`

**Interfaces:**
- Consumes: existing `SEMGREP_APP_TOKEN` Actions secret.
- Produces: diff-aware PR scans, main scans, manual runs, and scheduled full scans.

- [ ] Add a workflow using `semgrep/semgrep:1.170.0@sha256:c98f8829eea377274ee4b10656458b078b88232469b2ff913f091c2317347c9d`.
- [ ] Pin checkout to the repository's current trusted SHA and disable credential persistence.
- [ ] Run `semgrep ci` with `SEMGREP_APP_TOKEN`.
- [ ] Skip Dependabot-authored pull requests because secrets are unavailable.
- [ ] Run actionlint and zizmor against the new workflow.
- [ ] Commit the Semgrep workflow.

### Task 6: Document, validate, and open the pull request

**Files:**
- Create: `docs/security-tooling.md`
- Modify: `CONTRIBUTING.md`
- Verify all files from Tasks 1-5.

**Interfaces:**
- Produces: Contributor setup instructions and a reviewable PR closing #81.

- [ ] Document deterministic pre-commit installation and authenticated pre-push opt-in.
- [ ] Document `snyk auth`, Sonar Secrets environment variables, Semgrep CI, Renovate Dashboard behavior, and controlled bypass rules.
- [ ] Explain why Sonar coverage remains unavailable under automatic analysis and what external action is needed before CI migration.
- [ ] Run focused unit tests, pre-commit validation, local Semgrep, Renovate validator, build, typecheck, lint, test coverage, and full `ci:check`.
- [ ] Inspect the final diff for secrets, unpinned Actions/images, unknown Renovate labels, and whitespace errors.
- [ ] Push `chore/81-security-tooling` and create a PR with `Closes #81`.
- [ ] Require CI, Semgrep, Snyk, and SonarQube Cloud checks to pass before merge.
- [ ] After merge, trigger Renovate through Dependency Dashboard issue #30 and verify its refreshed dependency inventory.
