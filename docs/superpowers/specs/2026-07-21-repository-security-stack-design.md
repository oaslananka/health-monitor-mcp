# Repository Security Automation Stack Design

**Issue:** #90 — Align repository security automation with the solo-maintainer baseline

## Context

`health-monitor-mcp` already uses Renovate, CodeQL, Semgrep repository rules, Snyk, SonarQube Cloud, Gitleaks, OpenSSF Scorecard, dependency review, SBOM generation, REUSE, actionlint, and zizmor. GitHub secret scanning and push protection are enabled. Governance files and a main-branch ruleset already exist.

The remaining gaps are container-image vulnerability scanning, a few fast local repository hooks, and a merge configuration that still exposes merge and rebase options despite the project preferring squash history.

## Principles

- One primary tool per responsibility; avoid duplicate blocking gates.
- Keep fast deterministic checks in pre-commit and expensive scans in CI.
- Preserve solo-maintainer operability: require pull requests and resolved conversations, but no mandatory external reviewer.
- Pin third-party GitHub Actions to immutable commits and let Renovate maintain those pins.
- Do not introduce tools for ecosystems that are absent from the repository.

## Tool ownership

- **Dependency updates:** Renovate. Dependabot alerts remain enabled, but Dependabot version-update configuration and duplicate security-update PRs remain disabled because Renovate vulnerability alerts are active.
- **SAST:** CodeQL is the primary GitHub-native code scanning gate. Semgrep enforces repository-specific patterns. Snyk and SonarQube Cloud remain additional external visibility rather than duplicate mandatory SAST gates.
- **Secret scanning:** GitHub secret scanning with push protection is primary. Existing Gitleaks remains as defense in depth; no new TruffleHog gate is added in this change.
- **Container security:** Trivy scans the locally built Docker image for high and critical vulnerabilities.
- **Workflow security:** actionlint validates workflow syntax and expressions; zizmor checks GitHub Actions security policy both locally and in CI.
- **Coverage:** Codecov adds coverage and test analytics while Jest thresholds remain the blocking source of truth.

## Trivy integration

Run Trivy inside the existing `Docker Build` job after building `health-monitor-mcp:ci`. Use `aquasecurity/trivy-action` v0.36.0 pinned to commit `ed142fd0673e97e23eac54620cfb913e5ce36c25`.

Configuration:

- scan type: `image`;
- image: `health-monitor-mcp:ci`;
- scanner: `vuln` only, avoiding duplicate secret scanning;
- severities: `HIGH,CRITICAL`;
- ignore unfixed vulnerabilities to avoid blocking on issues without an available remediation;
- SARIF output uploaded with the existing pinned GitHub CodeQL upload action;
- scan exits non-zero for actionable findings;
- SARIF upload runs even when the scan fails.

Keeping the scan in the existing Docker job preserves the current required check context and avoids a ruleset migration.

## Pre-commit integration

Extend the existing fast deterministic hooks with:

- `check-toml` for `.mise.toml` and future TOML configuration;
- `mixed-line-ending` with `--fix=no` to detect cross-platform line-ending drift without rewriting files;
- `actionlint` v1.7.12 from its official pre-commit hook;
- `zizmor-pre-commit` v1.24.1 with offline low-severity analysis.

Do not add full tests, Docker builds, CodeQL, Trivy, Snyk Code, or Sonar analysis to pre-commit. Existing formatter, ESLint, TypeScript, Semgrep policy, and private-key checks remain.

Codespell and markdownlint are deferred because adding them would create a broad documentation reformat/spelling migration unrelated to the security goal. ShellCheck is not added as a standalone hook because the repository has no maintained standalone shell-script surface; workflow shell blocks are covered by actionlint and CI security review.

## GitHub settings

- Keep auto-merge enabled.
- Keep automatic branch deletion enabled.
- Disable merge commits and rebase merging; allow squash only.
- Update the active ruleset to allow only squash merge.
- Keep PR requirement, strict required checks, deletion/force-push protection, linear history, and conversation resolution.
- Keep required approving review count at zero for the solo maintainer.
- Keep default `GITHUB_TOKEN` permissions read-only and disallow Actions from approving pull requests.
- Keep merge queue disabled because the repository has low concurrent PR volume; therefore no `merge_group` trigger is needed.

## Selected Actions policy

Preserve the existing Release Please and Scorecard allowlist entries. Add exact pins for:

- `codecov/codecov-action@fb8b3582c8e4def4969c97caa2f19720cb33a72f`;
- `aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25`;
- nested `aquasecurity/setup-trivy@3fb12ec12f41e471780db15c232d5dd185dcb514`.

GitHub-owned actions remain allowed.

## Testing

Extend the repository quality-gate regression test to require:

- the immutable Trivy action pin;
- high/critical image scanning and SARIF upload;
- `if: always()` on SARIF upload;
- pre-commit TOML, mixed-line-ending, actionlint, and zizmor hooks;
- no Trivy secret scanner duplication;
- no merge queue workflow trigger.

Validation includes pre-commit, full CI, actionlint, zizmor, Codecov YAML validation, Trivy image scanning, audit, SBOM, REUSE, metadata, package dry-run, and release-state dry-run.

## Rollback

Removing the Trivy step returns the Docker job to build-only behavior. Removing the four pre-commit hooks does not affect application runtime. Repository merge settings can be restored independently. No database or public API changes are involved.
