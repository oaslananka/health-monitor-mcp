[**health-monitor-mcp**](../../README.md)

***

[health-monitor-mcp](../../README.md) / [types](../README.md) / HttpCheckResult

# Interface: HttpCheckResult

Defined in: [types.ts:599](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L599)

## Properties

### status

> **status**: `"up"` \| `"down"` \| `"timeout"` \| `"error"`

Defined in: [types.ts:600](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L600)

***

### response\_time\_ms

> **response\_time\_ms**: `number` \| `null`

Defined in: [types.ts:601](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L601)

***

### error\_message

> **error\_message**: `string` \| `null`

Defined in: [types.ts:602](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L602)

***

### response

> **response**: [`HttpResponseDetails`](HttpResponseDetails.md) \| `null`

Defined in: [types.ts:603](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L603)

***

### assertions

> **assertions**: [`HttpAssertionDiagnostic`](HttpAssertionDiagnostic.md)[]

Defined in: [types.ts:604](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L604)
