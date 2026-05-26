# ADR 0004: Release And Supply-Chain Evidence

Status: Accepted

Date: 2026-05-26

## Context

The package is distributed through GitHub Releases and npm. Release work must prove that generated
artifacts, SBOMs, checksums, license evidence, and repository security checks match the source that
was tagged.

## Decision

Use GitHub Actions as the release authority. Release workflows build package artifacts, verify
checksums and SBOM files, and publish evidence from CI. Local release-state checks remain dry-run
only, and npm publication is kept in a dedicated workflow so provenance and registry permissions are
auditable.

## Consequences

- Release artifacts are reproducible from workflow logs instead of local maintainer machines.
- SBOM, license, REUSE, and Scorecard evidence can be attached or linked from release and issue
  threads.
- npm publishing can remain blocked without invalidating GitHub Release artifact verification.
- Future Docker or registry surfaces should extend the release-state model before publishing.

## Validation

```bash
pnpm run ci
gh run list --limit 5
```
