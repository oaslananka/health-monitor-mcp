[**health-monitor-mcp**](../../README.md)

***

[health-monitor-mcp](../../README.md) / [types](../README.md) / RegisteredServer

# Interface: RegisteredServer

Defined in: [types.ts:467](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L467)

## Properties

### name

> **name**: `string`

Defined in: [types.ts:468](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L468)

***

### type

> **type**: `"http"` \| `"stdio"` \| `"sse"`

Defined in: [types.ts:469](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L469)

***

### url

> **url**: `string` \| `null`

Defined in: [types.ts:470](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L470)

***

### command

> **command**: `string` \| `null`

Defined in: [types.ts:471](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L471)

***

### args

> **args**: `string`[]

Defined in: [types.ts:472](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L472)

***

### tags

> **tags**: `string`[]

Defined in: [types.ts:473](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L473)

***

### alert\_on\_down

> **alert\_on\_down**: `boolean`

Defined in: [types.ts:474](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L474)

***

### check\_interval\_minutes

> **check\_interval\_minutes**: `number`

Defined in: [types.ts:475](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L475)

***

### created\_at

> **created\_at**: `number`

Defined in: [types.ts:476](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L476)

***

### last\_checked

> **last\_checked**: `number` \| `null`

Defined in: [types.ts:477](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L477)

***

### last\_status

> **last\_status**: `"up"` \| `"down"` \| `"timeout"` \| `"error"` \| `"unknown"`

Defined in: [types.ts:478](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L478)

***

### last\_response\_time\_ms

> **last\_response\_time\_ms**: `number` \| `null`

Defined in: [types.ts:479](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L479)

***

### consecutive\_failures

> **consecutive\_failures**: `number`

Defined in: [types.ts:480](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L480)
