[**health-monitor-mcp**](../../README.md)

***

[health-monitor-mcp](../../README.md) / [types](../README.md) / RegisteredServer

# Interface: RegisteredServer

Defined in: [types.ts:661](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L661)

## Properties

### name

> **name**: `string`

Defined in: [types.ts:662](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L662)

***

### type

> **type**: `"http"` \| `"stdio"` \| `"sse"`

Defined in: [types.ts:663](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L663)

***

### url

> **url**: `string` \| `null`

Defined in: [types.ts:664](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L664)

***

### command

> **command**: `string` \| `null`

Defined in: [types.ts:665](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L665)

***

### args

> **args**: `string`[]

Defined in: [types.ts:666](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L666)

***

### tags

> **tags**: `string`[]

Defined in: [types.ts:667](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L667)

***

### alert\_on\_down

> **alert\_on\_down**: `boolean`

Defined in: [types.ts:668](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L668)

***

### check\_interval\_minutes

> **check\_interval\_minutes**: `number`

Defined in: [types.ts:669](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L669)

***

### created\_at

> **created\_at**: `number`

Defined in: [types.ts:670](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L670)

***

### last\_checked

> **last\_checked**: `number` \| `null`

Defined in: [types.ts:671](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L671)

***

### last\_status

> **last\_status**: `"up"` \| `"down"` \| `"timeout"` \| `"error"` \| `"unknown"`

Defined in: [types.ts:672](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L672)

***

### last\_response\_time\_ms

> **last\_response\_time\_ms**: `number` \| `null`

Defined in: [types.ts:673](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L673)

***

### consecutive\_failures

> **consecutive\_failures**: `number`

Defined in: [types.ts:674](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L674)
