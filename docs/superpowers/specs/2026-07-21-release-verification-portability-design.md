# Release Verification Portability Design

**Issue:** #93 — Make release verification portable and registry publishing reusable

## Problem

The v1.1.0 release exposed two release-orchestration defects:

1. A reusable workflow preserves the caller event name. The MCP Registry publish job checked for `github.event_name == 'workflow_call'`, so a call from the npm release workflow retained `release` and skipped publishing.
2. npm tarball integrity includes archive metadata. A package produced by npm 11.16.0 can have the same extracted files as the package produced by the publishing runner while its tarball SRI differs because source file modes or other tar metadata differ. Comparing registry SRI with a newly generated local tarball SRI therefore creates false failures.

## Decision

### Registry workflow

Publish when all of these are true:

- repository owner is `oaslananka`;
- `inputs.tag_name` is non-empty;
- the execution is not a workflow-dispatch dry run.

Pull-request validation has no tag input and therefore cannot publish. A reusable call works regardless of the caller event name.

### npm package verification

Keep registry version and tarball URL validation. Download the registry tarball and compute its declared SRI directly. Generate a local package tarball in a temporary directory with lifecycle scripts disabled, then parse both gzip-compressed tar archives in Node.js.

Compare normalized package file paths, byte lengths, and SHA-256 content hashes. Ignore tar ownership, timestamps, and regular-file mode differences because npm normalizes those differently across environments. Preserve executable validation separately through the existing packaged smoke test and explicit CLI shebang check.

The tar reader supports normal files, GNU long names, and PAX path records without adding a runtime dependency. Temporary tarballs are removed in a `finally` block.

## Error handling

Verification fails on:

- registry version mismatch;
- missing or unsupported SRI;
- downloaded registry tarball SRI mismatch;
- missing, extra, or content-different package files;
- malformed gzip/tar data;
- failed local packaging or registry fetch.

Errors identify the affected path or verification stage without printing tokens.

## Testing

- Synthetic tarballs with identical file bytes but different timestamps and modes must compare equal.
- Changed, missing, and extra files must fail.
- SRI computation must match a known buffer.
- Quality-gate tests must reject the old `workflow_call` event check and require input-based publication.
- Full CI, pre-commit, actionlint, zizmor, package checks, and release dry-run must pass.

## Rollout

One PR closes #93. The already-published v1.1.0 artifacts remain unchanged; this fix makes independent verification portable and restores automatic registry publication for future releases.
