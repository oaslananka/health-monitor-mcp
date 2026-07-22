[**health-monitor-mcp**](../../README.md)

***

[health-monitor-mcp](../../README.md) / [types](../README.md) / HttpAssertionDiagnostic

# Interface: HttpAssertionDiagnostic

Defined in: [types.ts:573](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L573)

## Properties

### type

> **type**: `"status"` \| `"body_contains"` \| `"header"` \| `"json_equals"` \| `"tls_expiry"`

Defined in: [types.ts:574](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L574)

***

### passed

> **passed**: `boolean`

Defined in: [types.ts:575](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L575)

***

### path

> **path**: `string` \| `null`

Defined in: [types.ts:576](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L576)

***

### expected

> **expected**: `string` \| `number` \| `boolean` \| `null`

Defined in: [types.ts:577](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L577)

***

### actual

> **actual**: `string` \| `number` \| `boolean` \| `null`

Defined in: [types.ts:578](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L578)

***

### message

> **message**: `string`

Defined in: [types.ts:579](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L579)
