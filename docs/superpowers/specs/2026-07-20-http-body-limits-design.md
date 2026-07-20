# HTTP Request Body Limits Design

**Issue:** #76 — Enforce bounded HTTP request-body consumption and request timeouts

## Problem

The HTTP MCP endpoint currently rejects a request after more than 1 MiB has been observed, but it leaves the request listeners active and has no body-read deadline. Oversized or slow chunked clients can therefore continue occupying request and connection resources after the logical rejection point. The stateful path also returns non-JSON-RPC body errors while the stateless path returns JSON-RPC errors.

## Goals

- Reject a valid oversized `Content-Length` before body buffering.
- Retain no more than the configured byte limit for chunked requests.
- Stop body listeners and close the connection after oversized or timed-out bodies.
- Bound body-read time independently of MCP handler execution.
- Handle client aborts without creating a monitor transport or emitting an invalid response.
- Return equivalent JSON-RPC error envelopes in stateless and stateful POST paths.
- Make byte and timeout limits configurable while retaining 1 MiB and 15 seconds as defaults.

## Configuration

- `HEALTH_MONITOR_HTTP_MAX_BODY_BYTES`: default `1048576`, bounded from `1024` to `10485760`.
- `HEALTH_MONITOR_HTTP_BODY_TIMEOUT_MS`: default `15000`, bounded from `1000` to `120000`.
- `HttpServerOptions.maxRequestBodyBytes` and `requestBodyTimeoutMs` provide exact test/deployment overrides.

Reverse proxies must use an equal or smaller request-body limit and a request-body timeout no longer than the application timeout.

## Architecture

A private `RequestBodyError` carries one of four stable codes:

- `payload_too_large`
- `body_timeout`
- `request_aborted`
- `parse_error`

`src/http-body.ts` owns `readRequestBody()`, which receives the byte and timeout limits. It validates `Content-Length`, starts a deadline, and installs named listeners. On any terminal condition it clears the timer and detaches every listener. On limit or timeout it clears retained chunks and switches the request to flowing discard mode. The HTTP error response includes `Connection: close`, so Node closes the connection after flushing the response rather than waiting for a hostile body to complete.

A shared `respondToBodyReadError()` function serves both stateless and stateful POST paths:

- 413 / JSON-RPC code `-32001` / `Payload too large`
- 408 / JSON-RPC code `-32002` / `Request body timeout`
- 400 / JSON-RPC code `-32700` / `Parse error`
- aborted clients receive no response because their socket is already gone

All envelopes use `jsonrpc: "2.0"` and `id: null`, which is appropriate when the request ID could not be read. The MCP Streamable HTTP specification permits an HTTP error response containing a JSON-RPC error object when input cannot be accepted.

## Server Timeouts

`createHttpServer()` sets Node request and header timeouts to the body timeout plus a 1000 ms transport grace period, ensuring the JSON-RPC body timer wins after headers are accepted. The explicit body timer begins after headers are accepted and provides deterministic application behavior for slow/incomplete bodies. `Connection: close` is used for 408 and 413 responses.

## Testing

Tests use small injected limits and raw Node HTTP clients to cover:

- exact-limit acceptance
- early oversized `Content-Length` rejection before any body byte is sent
- chunked over-limit response before the client finishes sending
- slow/incomplete body timeout and connection closure
- client abort without monitor creation, followed by a healthy server request
- malformed JSON
- matching stateful and stateless JSON-RPC envelopes

The tests first fail against the current implementation. Focused tests, pre-commit, full CI, actionlint, and zizmor must then pass.
