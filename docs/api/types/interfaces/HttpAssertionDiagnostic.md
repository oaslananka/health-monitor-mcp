[**health-monitor-mcp**](../../README.md)

***

[health-monitor-mcp](../../README.md) / [types](../README.md) / HttpAssertionDiagnostic

# Interface: HttpAssertionDiagnostic

Defined in: [types.ts:575](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L575)

## Properties

### type

> **type**: `"status"` \| `"body_contains"` \| `"header"` \| `"json_equals"` \| `"tls_expiry"`

Defined in: [types.ts:576](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L576)

***

### passed

> **passed**: `boolean`

Defined in: [types.ts:577](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L577)

***

### path

> **path**: `string` \| `null`

Defined in: [types.ts:578](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L578)

***

### expected

> **expected**: [`HttpAssertionValue`](../type-aliases/HttpAssertionValue.md)

Defined in: [types.ts:579](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L579)

***

### actual

> **actual**: [`HttpAssertionValue`](../type-aliases/HttpAssertionValue.md)

Defined in: [types.ts:580](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L580)

***

### message

> **message**: `string`

Defined in: [types.ts:581](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L581)
