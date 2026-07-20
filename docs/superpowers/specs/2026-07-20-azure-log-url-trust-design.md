# Azure DevOps Log URL Trust Boundary Design

**Issue:** #75 — Prevent Azure DevOps PAT forwarding to untrusted log URLs

## Problem

Azure timeline records contain a full log URL. The current implementation attaches the PAT-derived Basic authorization header to that URL without validating its scheme, credentials, origin, endpoint path, or redirect behavior. A malicious or compromised response could therefore move Azure credentials outside the expected Azure DevOps build-log boundary.

Microsoft documents build-log retrieval under `https://dev.azure.com/{organization}/{project}/_apis/build/builds/{buildId}/logs/{logId}`. The timeline API describes the log URL as a full link to that resource.

## Goals

- Authenticate only HTTPS Azure DevOps build-log endpoints for the requested organization, project, and build.
- Support the modern `dev.azure.com` endpoint and the organization-scoped legacy `{organization}.visualstudio.com` endpoint.
- Follow only bounded same-origin redirects whose destination still matches the trusted build-log endpoint.
- Never forward authorization to a cross-origin redirect.
- Encode organization, project, pipeline, build, and query values centrally.
- Return stable redacted diagnostics without URLs, PATs, or generated Basic credentials.

## Non-goals

- OAuth migration or PAT rotation.
- Azure rate-limit diagnostics from #39.
- Following redirects between modern and legacy Azure origins.
- Accepting arbitrary Azure-owned domains or storage/CDN URLs.

## Architecture

`src/azure-devops.ts` will own three focused helpers:

1. `buildAzureProjectUrl()` constructs API and UI URLs from encoded path segments and URLSearchParams.
2. `validateAzureBuildLogUrl()` parses a timeline URL and verifies HTTPS, absent user-info, an approved organization-specific origin, and the expected build-log path.
3. `fetchAzureLogText()` uses `redirect: 'manual'`, follows at most three same-origin redirects, validates every destination before sending authorization, and returns log text.

Policy errors use a private `AzureLogSecurityError` with stable codes:

- `malformed-url`
- `https-required`
- `userinfo-not-allowed`
- `untrusted-origin`
- `unexpected-log-path`
- `missing-redirect-location`
- `cross-origin-redirect`
- `redirect-limit-exceeded`

These errors are non-retryable. `getPipelineLogs()` emits a redacted structured warning and returns a step-local diagnostic containing only the stable code.

## Trusted URL Rules

Modern origin:

- origin exactly `https://dev.azure.com`
- path segments begin with organization and project
- remaining path is `_apis/build/builds/{requestedBuildId}/logs/{logId}`

Legacy origin:

- origin exactly `https://{normalizedOrganization}.visualstudio.com`
- organization must be a valid DNS label before this origin is enabled
- path segments begin with project
- remaining path is `_apis/build/builds/{requestedBuildId}/logs/{logId}`

Path comparisons decode each segment and reject malformed percent encoding. API marker segments are compared case-insensitively; organization and project identifiers are compared case-insensitively to tolerate Azure canonicalization.

## Redirect Handling

Each authenticated request sets `redirect: 'manual'`.

- 301, 302, 303, 307, and 308 are handled explicitly.
- A missing `Location` is rejected.
- The destination is resolved relative to the current URL.
- Cross-origin destinations are rejected before a second fetch.
- Same-origin destinations are revalidated against the build-log path.
- At most three redirects are followed.
- Retry attempts restart from the original validated URL.

## Testing

Tests will first demonstrate current failures for:

- encoded organization/project values
- HTTP, malformed, user-info, and hostile-host log URLs
- valid modern and legacy Azure log URLs
- same-origin redirect success
- cross-origin redirect rejection without a second request
- redirect limit and missing location
- redacted diagnostics and absence of PAT material

Focused and full validation:

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js --runTestsByPath test/unit/azure-devops.test.ts --runInBand
pre-commit run --all-files --hook-stage pre-commit
pnpm run ci
```

## Compatibility

The public function signatures remain unchanged. Valid Azure DevOps build log URLs continue to work. Previously accepted arbitrary log hosts will be rejected by design.
