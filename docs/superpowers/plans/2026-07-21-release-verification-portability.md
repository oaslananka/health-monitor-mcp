# Release Verification Portability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make npm release verification independent of tar metadata and make reusable MCP Registry publishing work for release callers.

**Architecture:** A dependency-free Node helper parses gzip-compressed npm tarballs into normalized content hashes. The verifier authenticates the registry tarball SRI, compares extracted file content with a locally generated package, and cleans temporary files. The reusable workflow publishes based on validated inputs rather than caller event identity.

**Tech Stack:** Node.js 24, npm CLI, Node `crypto`/`zlib`, Jest 29, GitHub Actions.

## Constraints

- Do not compare local and registry tarball SRI.
- Do compare the registry tarball bytes with registry `dist.integrity`.
- Ignore tar timestamp, ownership, and regular-file mode differences.
- Fail on missing, extra, or content-different files.
- Keep pull-request and workflow-dispatch dry-run paths non-publishing.

### Task 1: Define failing contracts

- Modify `test/unit/quality-gates.test.ts` to require `inputs.tag_name != ''`, reject `github.event_name == 'workflow_call'`, and require content-based npm verification.
- Create `test/unit/package-tarball.test.ts` with synthetic tarballs proving metadata-independent equality and content-difference failures.
- Run focused tests and confirm RED.
- Commit `test: define portable release verification contract`.

### Task 2: Implement tarball content verification

- Create `scripts/package-tarball.mjs` and `scripts/package-tarball.d.mts`.
- Export SRI calculation, tar content indexing, and content comparison functions.
- Update `scripts/verify-npm-package.mjs` to create a temporary local tarball, fetch and authenticate the registry tarball, compare normalized contents, and clean up.
- Run focused tests and the verifier against npm 1.1.0.
- Commit `fix(release): verify published package contents portably`.

### Task 3: Fix reusable registry publication

- Update `.github/workflows/publish-mcp-registry.yml` publish condition to depend on owner, non-empty tag input, and non-dry-run dispatch.
- Update release documentation with automatic and manual recovery behavior.
- Run quality-gate tests, actionlint, and zizmor.
- Commit `fix(release): run registry publish for reusable callers`.

### Task 4: Verify and merge

- Run `pnpm run ci`, all pre-commit hooks, actionlint, zizmor, package dry-run, and release-state dry-run.
- Open one PR closing #93.
- Review all CI and bot/agent comments.
- Squash merge only after every check passes.
