[**mcp-health-monitor v1.0.5**](../../README.md)

***

[mcp-health-monitor](../../README.md) / [types](../README.md) / RegisteredServer

# Interface: RegisteredServer

Defined in: [types.ts:224](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L224)

## Properties

### name

> **name**: `string`

Defined in: [types.ts:225](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L225)

***

### type

> **type**: `"http"` \| `"stdio"` \| `"sse"`

Defined in: [types.ts:226](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L226)

***

### url

> **url**: `string` \| `null`

Defined in: [types.ts:227](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L227)

***

### command

> **command**: `string` \| `null`

Defined in: [types.ts:228](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L228)

***

### args

> **args**: `string`[]

Defined in: [types.ts:229](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L229)

***

### tags

> **tags**: `string`[]

Defined in: [types.ts:230](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L230)

***

### alert\_on\_down

> **alert\_on\_down**: `boolean`

Defined in: [types.ts:231](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L231)

***

### check\_interval\_minutes

> **check\_interval\_minutes**: `number`

Defined in: [types.ts:232](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L232)

***

### created\_at

> **created\_at**: `number`

Defined in: [types.ts:233](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L233)

***

### last\_checked

> **last\_checked**: `number` \| `null`

Defined in: [types.ts:234](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L234)

***

### last\_status

> **last\_status**: `"up"` \| `"down"` \| `"timeout"` \| `"error"` \| `"unknown"`

Defined in: [types.ts:235](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L235)

***

### last\_response\_time\_ms

> **last\_response\_time\_ms**: `number` \| `null`

Defined in: [types.ts:236](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L236)

***

### consecutive\_failures

> **consecutive\_failures**: `number`

Defined in: [types.ts:237](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L237)
