[**health-monitor-mcp**](../../README.md)

***

[health-monitor-mcp](../../README.md) / [types](../README.md) / ServerStatus

# Interface: ServerStatus

Defined in: [types.ts:193](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L193)

## Properties

### name

> **name**: `string`

Defined in: [types.ts:194](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L194)

***

### type

> **type**: `"http"` \| `"stdio"` \| `"sse"`

Defined in: [types.ts:195](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L195)

***

### url?

> `optional` **url?**: `string`

Defined in: [types.ts:196](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L196)

***

### command?

> `optional` **command?**: `string`

Defined in: [types.ts:197](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L197)

***

### status

> **status**: `"up"` \| `"down"` \| `"unknown"`

Defined in: [types.ts:198](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L198)

***

### last\_checked

> **last\_checked**: `number` \| `null`

Defined in: [types.ts:199](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L199)

***

### last\_response\_time\_ms

> **last\_response\_time\_ms**: `number` \| `null`

Defined in: [types.ts:200](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L200)

***

### tool\_count

> **tool\_count**: `number` \| `null`

Defined in: [types.ts:201](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L201)

***

### uptime\_24h\_percent

> **uptime\_24h\_percent**: `number` \| `null`

Defined in: [types.ts:202](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L202)

***

### consecutive\_failures

> **consecutive\_failures**: `number`

Defined in: [types.ts:203](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L203)

***

### tags

> **tags**: `string`[]

Defined in: [types.ts:204](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L204)
