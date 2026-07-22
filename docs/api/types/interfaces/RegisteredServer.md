[**health-monitor-mcp**](../../README.md)

***

[health-monitor-mcp](../../README.md) / [types](../README.md) / RegisteredServer

# Interface: RegisteredServer

Defined in: [types.ts:326](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L326)

## Properties

### name

> **name**: `string`

Defined in: [types.ts:327](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L327)

***

### type

> **type**: `"http"` \| `"stdio"` \| `"sse"`

Defined in: [types.ts:328](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L328)

***

### url

> **url**: `string` \| `null`

Defined in: [types.ts:329](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L329)

***

### command

> **command**: `string` \| `null`

Defined in: [types.ts:330](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L330)

***

### args

> **args**: `string`[]

Defined in: [types.ts:331](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L331)

***

### tags

> **tags**: `string`[]

Defined in: [types.ts:332](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L332)

***

### alert\_on\_down

> **alert\_on\_down**: `boolean`

Defined in: [types.ts:333](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L333)

***

### check\_interval\_minutes

> **check\_interval\_minutes**: `number`

Defined in: [types.ts:334](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L334)

***

### created\_at

> **created\_at**: `number`

Defined in: [types.ts:335](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L335)

***

### last\_checked

> **last\_checked**: `number` \| `null`

Defined in: [types.ts:336](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L336)

***

### last\_status

> **last\_status**: `"up"` \| `"down"` \| `"timeout"` \| `"error"` \| `"unknown"`

Defined in: [types.ts:337](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L337)

***

### last\_response\_time\_ms

> **last\_response\_time\_ms**: `number` \| `null`

Defined in: [types.ts:338](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L338)

***

### consecutive\_failures

> **consecutive\_failures**: `number`

Defined in: [types.ts:339](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L339)
