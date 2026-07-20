[**health-monitor-mcp v1.1.0**](../../README.md)

***

[health-monitor-mcp](../../README.md) / [types](../README.md) / RegisteredServer

# Interface: RegisteredServer

Defined in: [types.ts:177](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L177)

## Properties

### name

> **name**: `string`

Defined in: [types.ts:178](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L178)

***

### type

> **type**: `"http"` \| `"stdio"` \| `"sse"`

Defined in: [types.ts:179](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L179)

***

### url

> **url**: `string` \| `null`

Defined in: [types.ts:180](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L180)

***

### command

> **command**: `string` \| `null`

Defined in: [types.ts:181](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L181)

***

### args

> **args**: `string`[]

Defined in: [types.ts:182](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L182)

***

### tags

> **tags**: `string`[]

Defined in: [types.ts:183](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L183)

***

### alert\_on\_down

> **alert\_on\_down**: `boolean`

Defined in: [types.ts:184](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L184)

***

### check\_interval\_minutes

> **check\_interval\_minutes**: `number`

Defined in: [types.ts:185](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L185)

***

### created\_at

> **created\_at**: `number`

Defined in: [types.ts:186](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L186)

***

### last\_checked

> **last\_checked**: `number` \| `null`

Defined in: [types.ts:187](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L187)

***

### last\_status

> **last\_status**: `"up"` \| `"down"` \| `"timeout"` \| `"error"` \| `"unknown"`

Defined in: [types.ts:188](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L188)

***

### last\_response\_time\_ms

> **last\_response\_time\_ms**: `number` \| `null`

Defined in: [types.ts:189](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L189)

***

### consecutive\_failures

> **consecutive\_failures**: `number`

Defined in: [types.ts:190](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L190)
