[**health-monitor-mcp**](../../README.md)

***

[health-monitor-mcp](../../README.md) / [types](../README.md) / HttpCheckResult

# Interface: HttpCheckResult

Defined in: [types.ts:673](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L673)

## Properties

### status

> **status**: `"up"` \| `"down"` \| `"timeout"` \| `"error"`

Defined in: [types.ts:674](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L674)

***

### response\_time\_ms

> **response\_time\_ms**: `number` \| `null`

Defined in: [types.ts:675](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L675)

***

### error\_message

> **error\_message**: `string` \| `null`

Defined in: [types.ts:676](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L676)

***

### response

> **response**: [`HttpResponseDetails`](HttpResponseDetails.md) \| `null`

Defined in: [types.ts:677](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L677)

***

### assertions

> **assertions**: [`HttpAssertionDiagnostic`](HttpAssertionDiagnostic.md)[]

Defined in: [types.ts:678](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L678)
