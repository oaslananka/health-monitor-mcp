# Generic HTTP, TLS Expiry, and Response Assertion Monitoring Design

## Status

Approved for autonomous implementation under the maintainer instruction to continue without repeated approval prompts.

## Problem

The monitor currently checks MCP servers and CI providers, but it cannot monitor a conventional HTTP dependency such as a health endpoint, API readiness route, website, or certificate expiry. A generic HTTP provider must be useful for operators without becoming an SSRF primitive, leaking response bodies, or creating unbounded network and storage costs.

## Goals

- Register, check, list, schedule, report, and remove generic HTTP targets.
- Validate expected HTTP status codes, response headers, body substrings, and bounded JSON path equality assertions.
- Inspect HTTPS peer certificate expiry and fail before a configured threshold.
- Apply one explicit SSRF policy at registration, every DNS resolution, and every redirect.
- Preserve existing bounded concurrency, retention, dashboard, Markdown report, metadata, and release conventions.
- Keep secrets and response bodies out of SQLite, logs, reports, and tool responses.

## Non-goals

- Arbitrary request methods, request bodies, cookies, proxy support, or custom authentication headers.
- User-supplied regular expressions or executable assertion code.
- Browser rendering, JavaScript execution, synthetic transactions, or multi-step workflows.
- Monitoring Unix sockets or non-HTTP protocols.
- Persisting full response bodies or TLS certificate chains.

## Approaches Considered

### 1. Public-network-only targets

This is the smallest and safest implementation, but it prevents common internal service monitoring even for trusted local deployments.

### 2. Public by default with exact-origin private-network override

This preserves safe defaults while allowing an operator to opt into a known internal origin. The override is accepted only in the `full` runtime profile and never in `remote-safe`, `chatgpt`, or `claude` profiles. This is the selected approach.

### 3. Unrestricted network access with warnings

This is rejected because tool callers could probe loopback, cloud metadata, link-local, private, or otherwise non-public addresses.

## Public Tool Surface

Add four tools:

- `register_http_target`
- `check_http_target`
- `list_http_targets`
- `unregister_http_target`

A registration contains:

- `name`: existing safe local name rules.
- `url`: HTTP or HTTPS URL, maximum 2048 characters, without credentials or fragment.
- `expected_statuses`: one to twenty exact status codes, default `[200]`.
- `header_assertions`: up to ten case-insensitive exact header comparisons.
- `body_contains`: up to five UTF-8 substrings, each at most 512 characters.
- `json_assertions`: up to ten dot-path equality checks against JSON scalar values.
- `tls_expiry_days`: optional integer from 1 to 3650; valid only for HTTPS.
- `tags`: existing tag rules.
- `check_interval_minutes`: existing 1–60 minute range.

The provider intentionally supports GET only. This keeps requests idempotent and avoids request-body and authorization-secret handling.

## SSRF and Network Policy

### URL syntax

Registration and redirects require:

- scheme `http:` or `https:`;
- no username or password;
- no fragment;
- a hostname;
- ports in the URL parser’s valid range.

The normalized URL preserves path and query because health endpoints may require them.

### Public address classification

Before connecting, resolve all A and AAAA records with `dns.promises.lookup(hostname, { all: true, verbatim: true })`. Reject the target when:

- resolution returns no addresses;
- any returned address is loopback, unspecified, private, link-local, carrier-grade NAT, multicast, documentation, benchmarking, reserved, or otherwise non-public;
- the hostname is `localhost` or ends in `.localhost`, `.local`, `.internal`, or `.home.arpa` without an allowed override.

Rejecting when any answer is non-public prevents mixed public/private DNS rebinding sets.

### Exact-origin override

`HEALTH_MONITOR_HTTP_TARGET_ALLOWLIST` is a comma-separated list of normalized HTTP(S) origins, such as `https://status.internal.example:8443`.

An origin in this allowlist may resolve to a non-public address only when the runtime profile is `full`. Remote-safe profiles ignore the override and remain public-only. The allowlist never bypasses URL syntax validation, timeout limits, response limits, or redirect revalidation.

### DNS pinning and redirects

The request implementation uses Node’s `http`/`https` clients with a custom `lookup` callback pinned to a previously validated address. This prevents a second uncontrolled DNS lookup between policy validation and connection.

Redirects are manual, limited to three, and each destination repeats URL validation, DNS resolution, address classification, and exact-origin override evaluation. Relative redirects resolve against the prior URL. HTTPS-to-HTTP redirects are allowed only when the destination independently passes policy; the result records the final URL and redirect count.

## HTTP and TLS Execution

- One total timeout budget applies to DNS, redirects, connection, headers, and body reading.
- Response bodies are capped at 256 KiB. The request is destroyed when the cap is exceeded.
- Response headers are normalized to lower-case string values and only assertion-relevant values are returned.
- The checker records status code, final URL, redirect count, content type, content length, response time, and assertion diagnostics.
- The checker never returns or persists the full body.

For HTTPS, capture `TLSSocket.getPeerCertificate()` from the validated connection. Record:

- certificate subject common name when present;
- issuer common name when present;
- `valid_from` and `valid_to` ISO strings;
- whole `days_remaining` rounded down.

Certificate validation remains enabled. Invalid chains, hostname mismatches, expired certificates, and handshake failures return structured provider errors. When `tls_expiry_days` is configured and the certificate has fewer remaining days, the assertion fails and the target status is `down`.

## Assertion Model

Every assertion yields:

```ts
interface HttpAssertionDiagnostic {
  type: 'status' | 'header' | 'body_contains' | 'json_equals' | 'tls_expiry';
  passed: boolean;
  path: string | null;
  expected: string | number | boolean | null;
  actual: string | number | boolean | null;
  message: string;
}
```

Rules:

- Status passes when the actual code is in `expected_statuses`.
- Header names compare case-insensitively; values compare exactly after Node header normalization.
- Every configured body substring must occur in the bounded UTF-8 body.
- JSON assertions parse the body once and traverse own-properties by dot-separated path segments. Arrays use non-negative decimal indexes. Prototype-related segments `__proto__`, `prototype`, and `constructor` are forbidden.
- JSON expected values are scalars only: string, number, boolean, or null.
- TLS expiry is evaluated only on HTTPS.

The result status is:

- `up` when the request succeeds and every assertion passes;
- `down` when the response is reachable but one or more assertions fail;
- `timeout` when the total budget expires;
- `error` for policy, DNS, network, TLS, malformed JSON required by assertions, or bounded-resource failures.

## Storage

Migration v7 creates:

- `http_targets`
- `http_checks`

`http_targets` stores the normalized URL, assertion configuration JSON, scheduling fields, and latest summary fields. `http_checks` stores response metadata, TLS summary, assertion diagnostics JSON, and errors.

Neither table stores response bodies, cookies, authorization values, or complete certificate chains. Deleting a target cascades to its history. Retention pruning follows the existing bounded 1000-row deletion pattern.

## Integration

- `check_all` appends HTTP targets after MCP, GitHub Actions, and GitLab targets while retaining one shared concurrency limit.
- The scheduler adds due HTTP targets to the same queue and passes the active runtime profile to the HTTP checker.
- Dashboard and Markdown report sections show URL, status code, TLS days remaining, uptime, average response time, failed assertions, and consecutive failures.
- Monitor statistics include HTTP target and check counts.
- MCP metadata expands from 18 to 22 tools and documents `HEALTH_MONITOR_HTTP_TARGET_ALLOWLIST`.

## Error Handling

Expected tool-level failures use stable envelopes:

- `HTTP_TARGET_NOT_FOUND`
- `HTTP_TARGET_URL_NOT_ALLOWED`

Live check failures remain provider check results so they can be persisted and aggregated. Error text must not contain response bodies or environment values.

## Testing

Test layers:

1. Schema tests for URL, assertions, bounds, TLS-only constraints, and JSON path safety.
2. Network policy tests for IPv4/IPv6 public/private classification, blocked host suffixes, exact-origin allowlist, remote-safe override denial, mixed DNS answers, and redirect revalidation.
3. Checker tests with local mocked DNS and HTTP/TLS servers for status/header/body/JSON/TLS assertions, redirect caps, body caps, timeout, and certificate errors.
4. Registry tests for CRUD, history, retention, cascade, and dashboard aggregation.
5. Tool/app/scheduler tests for four public tools and one shared provider queue.
6. Packaged metadata and generated API documentation regression tests.
7. Full repository CI, audit, SBOM, license, REUSE, package-consumer, pre-commit, Codecov, and remote PR checks.

## Release Semantics

The feature is backward compatible but adds public tools, so Release Please should create a minor release. Since v1.3.0 already shipped GitLab monitoring, this provider is expected to publish as v1.4.0. Milestone titles must be shifted accordingly without changing issue membership or dates.
