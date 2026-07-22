[**health-monitor-mcp**](../../README.md)

***

[health-monitor-mcp](../../README.md) / [types](../README.md) / ServerStatus

# Interface: ServerStatus

Defined in: [types.ts:342](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L342)

## Properties

### name

> **name**: `string`

Defined in: [types.ts:343](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L343)

***

### type

> **type**: `"http"` \| `"stdio"` \| `"sse"`

Defined in: [types.ts:344](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L344)

***

### url?

> `optional` **url?**: `string`

Defined in: [types.ts:345](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L345)

***

### command?

> `optional` **command?**: `string`

Defined in: [types.ts:346](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L346)

***

### status

> **status**: `"up"` \| `"down"` \| `"unknown"`

Defined in: [types.ts:347](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L347)

***

### last\_checked

> **last\_checked**: `number` \| `null`

Defined in: [types.ts:348](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L348)

***

### last\_response\_time\_ms

> **last\_response\_time\_ms**: `number` \| `null`

Defined in: [types.ts:349](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L349)

***

### tool\_count

> **tool\_count**: `number` \| `null`

Defined in: [types.ts:350](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L350)

***

### uptime\_24h\_percent

> **uptime\_24h\_percent**: `number` \| `null`

Defined in: [types.ts:351](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L351)

***

### consecutive\_failures

> **consecutive\_failures**: `number`

Defined in: [types.ts:352](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L352)

***

### tags

> **tags**: `string`[]

Defined in: [types.ts:353](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L353)
