[**health-monitor-mcp**](../../README.md)

***

[health-monitor-mcp](../../README.md) / [types](../README.md) / ServerStatus

# Interface: ServerStatus

Defined in: [types.ts:483](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L483)

## Properties

### name

> **name**: `string`

Defined in: [types.ts:484](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L484)

***

### type

> **type**: `"http"` \| `"stdio"` \| `"sse"`

Defined in: [types.ts:485](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L485)

***

### url?

> `optional` **url?**: `string`

Defined in: [types.ts:486](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L486)

***

### command?

> `optional` **command?**: `string`

Defined in: [types.ts:487](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L487)

***

### status

> **status**: `"up"` \| `"down"` \| `"unknown"`

Defined in: [types.ts:488](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L488)

***

### last\_checked

> **last\_checked**: `number` \| `null`

Defined in: [types.ts:489](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L489)

***

### last\_response\_time\_ms

> **last\_response\_time\_ms**: `number` \| `null`

Defined in: [types.ts:490](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L490)

***

### tool\_count

> **tool\_count**: `number` \| `null`

Defined in: [types.ts:491](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L491)

***

### uptime\_24h\_percent

> **uptime\_24h\_percent**: `number` \| `null`

Defined in: [types.ts:492](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L492)

***

### consecutive\_failures

> **consecutive\_failures**: `number`

Defined in: [types.ts:493](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L493)

***

### tags

> **tags**: `string`[]

Defined in: [types.ts:494](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L494)
