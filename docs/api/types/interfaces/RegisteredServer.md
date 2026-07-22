[**health-monitor-mcp**](../../README.md)

***

[health-monitor-mcp](../../README.md) / [types](../README.md) / RegisteredServer

# Interface: RegisteredServer

Defined in: [types.ts:659](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L659)

## Properties

### name

> **name**: `string`

Defined in: [types.ts:660](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L660)

***

### type

> **type**: `"http"` \| `"stdio"` \| `"sse"`

Defined in: [types.ts:661](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L661)

***

### url

> **url**: `string` \| `null`

Defined in: [types.ts:662](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L662)

***

### command

> **command**: `string` \| `null`

Defined in: [types.ts:663](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L663)

***

### args

> **args**: `string`[]

Defined in: [types.ts:664](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L664)

***

### tags

> **tags**: `string`[]

Defined in: [types.ts:665](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L665)

***

### alert\_on\_down

> **alert\_on\_down**: `boolean`

Defined in: [types.ts:666](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L666)

***

### check\_interval\_minutes

> **check\_interval\_minutes**: `number`

Defined in: [types.ts:667](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L667)

***

### created\_at

> **created\_at**: `number`

Defined in: [types.ts:668](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L668)

***

### last\_checked

> **last\_checked**: `number` \| `null`

Defined in: [types.ts:669](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L669)

***

### last\_status

> **last\_status**: `"up"` \| `"down"` \| `"timeout"` \| `"error"` \| `"unknown"`

Defined in: [types.ts:670](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L670)

***

### last\_response\_time\_ms

> **last\_response\_time\_ms**: `number` \| `null`

Defined in: [types.ts:671](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L671)

***

### consecutive\_failures

> **consecutive\_failures**: `number`

Defined in: [types.ts:672](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L672)
