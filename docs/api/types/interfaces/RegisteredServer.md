[**health-monitor-mcp**](../../README.md)

***

[health-monitor-mcp](../../README.md) / [types](../README.md) / RegisteredServer

# Interface: RegisteredServer

Defined in: [types.ts:733](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L733)

## Properties

### name

> **name**: `string`

Defined in: [types.ts:734](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L734)

***

### type

> **type**: `"http"` \| `"stdio"` \| `"sse"`

Defined in: [types.ts:735](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L735)

***

### url

> **url**: `string` \| `null`

Defined in: [types.ts:736](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L736)

***

### command

> **command**: `string` \| `null`

Defined in: [types.ts:737](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L737)

***

### args

> **args**: `string`[]

Defined in: [types.ts:738](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L738)

***

### tags

> **tags**: `string`[]

Defined in: [types.ts:739](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L739)

***

### alert\_on\_down

> **alert\_on\_down**: `boolean`

Defined in: [types.ts:740](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L740)

***

### check\_interval\_minutes

> **check\_interval\_minutes**: `number`

Defined in: [types.ts:741](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L741)

***

### created\_at

> **created\_at**: `number`

Defined in: [types.ts:742](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L742)

***

### last\_checked

> **last\_checked**: `number` \| `null`

Defined in: [types.ts:743](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L743)

***

### last\_status

> **last\_status**: `"up"` \| `"down"` \| `"timeout"` \| `"error"` \| `"unknown"`

Defined in: [types.ts:744](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L744)

***

### last\_response\_time\_ms

> **last\_response\_time\_ms**: `number` \| `null`

Defined in: [types.ts:745](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L745)

***

### consecutive\_failures

> **consecutive\_failures**: `number`

Defined in: [types.ts:746](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L746)
