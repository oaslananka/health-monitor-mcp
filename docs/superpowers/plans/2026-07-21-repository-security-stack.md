# Repository Security Automation Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add container-image vulnerability scanning, fast local workflow security checks, and squash-only repository settings without creating duplicate blocking security gates.

**Architecture:** The existing Docker CI job builds one local image and then runs a pinned Trivy image scan whose SARIF output is uploaded through the existing pinned CodeQL action. Pre-commit gains only fast deterministic configuration and workflow checks. GitHub settings are tightened separately while preserving the solo-maintainer ruleset model.

**Tech Stack:** GitHub Actions, Trivy Action v0.36.0, actionlint v1.7.12, zizmor-pre-commit v1.24.1, pre-commit 4.6.0, GitHub repository rulesets.

## Global Constraints

- Keep CodeQL as the primary blocking SAST layer and Semgrep for repository-specific rules.
- Do not add Trivy secret scanning because GitHub push protection and Gitleaks already cover secrets.
- Run Trivy only after building `health-monitor-mcp:ci`.
- Block on fixed high/critical image vulnerabilities; ignore vulnerabilities without a fix.
- Upload SARIF even when Trivy exits non-zero.
- Keep required approving review count at zero for the solo maintainer.
- Allow squash merge only; keep auto-merge and branch deletion enabled.
- Keep merge queue disabled for the current low-volume repository.

---

### Task 1: Define repository stack regression expectations

**Files:**
- Modify: `test/unit/quality-gates.test.ts`

- [ ] **Step 1: Add a failing test**

Add a test that reads `.github/workflows/ci.yml` and `.pre-commit-config.yaml` and asserts:

```ts
expect(ciWorkflow).toContain(
  'aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25'
);
expect(ciWorkflow).toContain('image-ref: health-monitor-mcp:ci');
expect(ciWorkflow).toContain('scanners: vuln');
expect(ciWorkflow).toContain('severity: HIGH,CRITICAL');
expect(ciWorkflow).toContain('ignore-unfixed: true');
expect(ciWorkflow).toContain('exit-code: 1');
expect(ciWorkflow).toContain('format: sarif');
expect(ciWorkflow).toContain('output: trivy-results.sarif');
expect(ciWorkflow).toContain('if: always()');
expect(ciWorkflow).toContain('sarif_file: trivy-results.sarif');
expect(ciWorkflow).not.toContain('scanners: vuln,secret');
expect(ciWorkflow).not.toContain('merge_group:');

expect(preCommitConfig).toContain('- id: check-toml');
expect(preCommitConfig).toContain('- id: mixed-line-ending');
expect(preCommitConfig).toContain('args: [--fix=no]');
expect(preCommitConfig).toContain('repo: https://github.com/rhysd/actionlint');
expect(preCommitConfig).toContain('rev: v1.7.12');
expect(preCommitConfig).toContain('repo: https://github.com/zizmorcore/zizmor-pre-commit');
expect(preCommitConfig).toContain('rev: v1.24.1');
```

- [ ] **Step 2: Verify RED**

Run:

```bash
mise x node@24.18.0 -- node --experimental-vm-modules \
  node_modules/jest/bin/jest.js \
  --runTestsByPath test/unit/quality-gates.test.ts --runInBand
```

Expected: FAIL because Trivy and the new hooks are absent.

- [ ] **Step 3: Commit the test**

```bash
git add test/unit/quality-gates.test.ts
git commit -m "test: define repository security stack contract"
```

---

### Task 2: Add fast deterministic pre-commit hooks

**Files:**
- Modify: `.pre-commit-config.yaml`

- [ ] **Step 1: Add built-in configuration checks**

Under `pre-commit/pre-commit-hooks` add:

```yaml
      - id: check-toml
      - id: mixed-line-ending
        args: [--fix=no]
```

- [ ] **Step 2: Add official actionlint and zizmor hooks**

Add:

```yaml
  - repo: https://github.com/rhysd/actionlint
    rev: v1.7.12
    hooks:
      - id: actionlint

  - repo: https://github.com/zizmorcore/zizmor-pre-commit
    rev: v1.24.1
    hooks:
      - id: zizmor
        args: [--no-progress, --offline, --min-severity, low]
```

- [ ] **Step 3: Run the new hooks**

```bash
pre-commit run check-toml --all-files
pre-commit run mixed-line-ending --all-files
pre-commit run actionlint --all-files
pre-commit run zizmor --all-files
```

Expected: all exit 0. Fix actionable repository findings rather than suppressing them globally.

- [ ] **Step 4: Commit**

```bash
git add .pre-commit-config.yaml
git commit -m "chore: add local workflow security hooks"
```

---

### Task 3: Add Trivy to the existing Docker CI job

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add image scanning after the Docker smoke test**

Add:

```yaml
      - name: Scan image with Trivy
        uses: aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25 # v0.36.0
        with:
          scan-type: image
          image-ref: health-monitor-mcp:ci
          scanners: vuln
          severity: HIGH,CRITICAL
          ignore-unfixed: true
          exit-code: 1
          format: sarif
          output: trivy-results.sarif
          limit-severities-for-sarif: true
          version: v0.70.0

      - name: Upload Trivy SARIF
        if: always()
        uses: github/codeql-action/upload-sarif@3ce22a6e336a7fcc318bc58ae1986395bdc83ba7
        with:
          sarif_file: trivy-results.sarif
          category: trivy-container
```

- [ ] **Step 2: Run focused regression and workflow linting**

```bash
mise x node@24.18.0 -- node --experimental-vm-modules \
  node_modules/jest/bin/jest.js \
  --runTestsByPath test/unit/quality-gates.test.ts --runInBand
actionlint .github/workflows/*.yml
zizmor --offline --min-severity low .github/workflows
```

Expected: all exit 0.

- [ ] **Step 3: Build and scan locally with pinned Trivy 0.70.0**

Build `health-monitor-mcp:ci`, install or download the checksum-verified Trivy 0.70.0 binary, then run:

```bash
trivy image \
  --scanners vuln \
  --severity HIGH,CRITICAL \
  --ignore-unfixed \
  --exit-code 1 \
  health-monitor-mcp:ci
```

Expected: exit 0 or actionable vulnerabilities fixed before proceeding.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml test/unit/quality-gates.test.ts
git commit -m "ci: scan container image with Trivy"
```

---

### Task 4: Apply external GitHub settings

**Files:**
- External repository settings only.

- [ ] **Step 1: Extend selected-actions allowlist**

Preserve existing entries and add exact patterns for Codecov, Trivy, and nested setup-trivy.

- [ ] **Step 2: Set workflow token defaults**

Verify and enforce:

```json
{
  "default_workflow_permissions": "read",
  "can_approve_pull_request_reviews": false
}
```

- [ ] **Step 3: Tighten merge methods**

Set repository settings to:

```json
{
  "allow_squash_merge": true,
  "allow_merge_commit": false,
  "allow_rebase_merge": false,
  "allow_auto_merge": true,
  "delete_branch_on_merge": true
}
```

Update ruleset `main-ci-solo-maintainer` so `allowed_merge_methods` contains only `squash`; preserve every other rule and required check.

- [ ] **Step 4: Verify security settings**

Read back and confirm secret scanning and push protection are enabled, Dependabot alerts are enabled, Renovate vulnerability alerts remain active, and no `.github/dependabot.yml` version-update configuration exists.

---

### Task 5: Document and fully verify

**Files:**
- Modify: `docs/security-tooling.md`
- Modify: `docs/operations.md`
- Modify: design and plan documents if implementation details changed.

- [ ] **Step 1: Document tool ownership and deferrals**

Document Trivy's container-only role, pre-commit hooks, CodeQL/Semgrep ownership, secret scanning, squash-only settings, and the decision not to add merge queue, Mergify, TruffleHog, standalone ShellCheck, codespell, or markdownlint in this change.

- [ ] **Step 2: Run fresh complete verification**

```bash
pnpm run ci
pre-commit run --all-files --hook-stage pre-commit
curl --fail --data-binary @codecov.yml https://codecov.io/validate
actionlint .github/workflows/*.yml
zizmor --offline --min-severity low .github/workflows
docker build -t health-monitor-mcp:ci .
trivy image --scanners vuln --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 health-monitor-mcp:ci
git diff --check
git status --short --branch
```

Expected: all exit 0 and the worktree is clean.

- [ ] **Step 3: Include issue #90 in the existing Codecov PR**

The PR body must close both #89 and #90, list external settings changes, and explain why duplicate blocking tools and merge queue were not added.
