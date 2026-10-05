[**health-monitor-mcp**](../../README.md)

***

[health-monitor-mcp](../../README.md) / [types](../README.md) / ServerStatus

# Interface: ServerStatus

Defined in: [types.ts:749](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L749)

## Properties

### name

> **name**: `string`

Defined in: [types.ts:750](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L750)

***

### type

> **type**: `"http"` \| `"stdio"` \| `"sse"`

Defined in: [types.ts:751](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L751)

***

### url?

> `optional` **url?**: `string`

Defined in: [types.ts:752](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L752)

***

### command?

> `optional` **command?**: `string`

Defined in: [types.ts:753](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L753)

***

### status

> **status**: `"up"` \| `"down"` \| `"unknown"`

Defined in: [types.ts:754](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L754)

***

### last\_checked

> **last\_checked**: `number` \| `null`

Defined in: [types.ts:755](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L755)

***

### last\_response\_time\_ms

> **last\_response\_time\_ms**: `number` \| `null`

Defined in: [types.ts:756](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L756)

***

### tool\_count

> **tool\_count**: `number` \| `null`

Defined in: [types.ts:757](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L757)

***

### uptime\_24h\_percent

> **uptime\_24h\_percent**: `number` \| `null`

Defined in: [types.ts:758](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L758)

***

### consecutive\_failures

> **consecutive\_failures**: `number`

Defined in: [types.ts:759](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L759)

***

### tags

> **tags**: `string`[]

Defined in: [types.ts:760](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L760)
