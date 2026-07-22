[**health-monitor-mcp**](../../README.md)

***

[health-monitor-mcp](../../README.md) / [types](../README.md) / ServerStatus

# Interface: ServerStatus

Defined in: [types.ts:677](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L677)

## Properties

### name

> **name**: `string`

Defined in: [types.ts:678](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L678)

***

### type

> **type**: `"http"` \| `"stdio"` \| `"sse"`

Defined in: [types.ts:679](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L679)

***

### url?

> `optional` **url?**: `string`

Defined in: [types.ts:680](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L680)

***

### command?

> `optional` **command?**: `string`

Defined in: [types.ts:681](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L681)

***

### status

> **status**: `"up"` \| `"down"` \| `"unknown"`

Defined in: [types.ts:682](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L682)

***

### last\_checked

> **last\_checked**: `number` \| `null`

Defined in: [types.ts:683](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L683)

***

### last\_response\_time\_ms

> **last\_response\_time\_ms**: `number` \| `null`

Defined in: [types.ts:684](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L684)

***

### tool\_count

> **tool\_count**: `number` \| `null`

Defined in: [types.ts:685](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L685)

***

### uptime\_24h\_percent

> **uptime\_24h\_percent**: `number` \| `null`

Defined in: [types.ts:686](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L686)

***

### consecutive\_failures

> **consecutive\_failures**: `number`

Defined in: [types.ts:687](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L687)

***

### tags

> **tags**: `string`[]

Defined in: [types.ts:688](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L688)
