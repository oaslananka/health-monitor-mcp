[**health-monitor-mcp v1.0.0**](../../README.md)

***

[health-monitor-mcp](../../README.md) / [types](../README.md) / ServerStatus

# Interface: ServerStatus

Defined in: [types.ts:240](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L240)

## Properties

### name

> **name**: `string`

Defined in: [types.ts:241](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L241)

***

### type

> **type**: `"http"` \| `"stdio"` \| `"sse"`

Defined in: [types.ts:242](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L242)

***

### url?

> `optional` **url?**: `string`

Defined in: [types.ts:243](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L243)

***

### command?

> `optional` **command?**: `string`

Defined in: [types.ts:244](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L244)

***

### status

> **status**: `"up"` \| `"down"` \| `"unknown"`

Defined in: [types.ts:245](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L245)

***

### last\_checked

> **last\_checked**: `number` \| `null`

Defined in: [types.ts:246](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L246)

***

### last\_response\_time\_ms

> **last\_response\_time\_ms**: `number` \| `null`

Defined in: [types.ts:247](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L247)

***

### tool\_count

> **tool\_count**: `number` \| `null`

Defined in: [types.ts:248](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L248)

***

### uptime\_24h\_percent

> **uptime\_24h\_percent**: `number` \| `null`

Defined in: [types.ts:249](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L249)

***

### consecutive\_failures

> **consecutive\_failures**: `number`

Defined in: [types.ts:250](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L250)

***

### tags

> **tags**: `string`[]

Defined in: [types.ts:251](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L251)
