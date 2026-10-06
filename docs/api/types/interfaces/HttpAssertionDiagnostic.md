[**health-monitor-mcp**](../../README.md)

***

[health-monitor-mcp](../../README.md) / [types](../README.md) / HttpAssertionDiagnostic

# Interface: HttpAssertionDiagnostic

Defined in: [types.ts:647](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L647)

## Properties

### type

> **type**: `"status"` \| `"body_contains"` \| `"header"` \| `"json_equals"` \| `"tls_expiry"`

Defined in: [types.ts:648](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L648)

***

### passed

> **passed**: `boolean`

Defined in: [types.ts:649](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L649)

***

### path

> **path**: `string` \| `null`

Defined in: [types.ts:650](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L650)

***

### expected

> **expected**: [`HttpAssertionValue`](../type-aliases/HttpAssertionValue.md)

Defined in: [types.ts:651](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L651)

***

### actual

> **actual**: [`HttpAssertionValue`](../type-aliases/HttpAssertionValue.md)

Defined in: [types.ts:652](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L652)

***

### message

> **message**: `string`

Defined in: [types.ts:653](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L653)
