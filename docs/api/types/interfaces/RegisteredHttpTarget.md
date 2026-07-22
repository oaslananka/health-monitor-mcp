[**health-monitor-mcp**](../../README.md)

***

[health-monitor-mcp](../../README.md) / [types](../README.md) / RegisteredHttpTarget

# Interface: RegisteredHttpTarget

Defined in: [types.ts:607](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L607)

## Properties

### name

> **name**: `string`

Defined in: [types.ts:608](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L608)

***

### url

> **url**: `string`

Defined in: [types.ts:609](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L609)

***

### expected\_statuses

> **expected\_statuses**: `number`[]

Defined in: [types.ts:610](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L610)

***

### header\_assertions

> **header\_assertions**: [`HttpHeaderAssertion`](HttpHeaderAssertion.md)[]

Defined in: [types.ts:611](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L611)

***

### body\_contains

> **body\_contains**: `string`[]

Defined in: [types.ts:612](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L612)

***

### json\_assertions

> **json\_assertions**: [`HttpJsonAssertion`](HttpJsonAssertion.md)[]

Defined in: [types.ts:613](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L613)

***

### tls\_expiry\_days

> **tls\_expiry\_days**: `number` \| `null`

Defined in: [types.ts:614](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L614)

***

### tags

> **tags**: `string`[]

Defined in: [types.ts:615](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L615)

***

### check\_interval\_minutes

> **check\_interval\_minutes**: `number`

Defined in: [types.ts:616](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L616)

***

### created\_at

> **created\_at**: `number`

Defined in: [types.ts:617](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L617)

***

### last\_checked

> **last\_checked**: `number` \| `null`

Defined in: [types.ts:618](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L618)

***

### last\_status

> **last\_status**: `"up"` \| `"down"` \| `"timeout"` \| `"error"` \| `"unknown"`

Defined in: [types.ts:619](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L619)

***

### last\_response\_time\_ms

> **last\_response\_time\_ms**: `number` \| `null`

Defined in: [types.ts:620](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L620)

***

### last\_status\_code

> **last\_status\_code**: `number` \| `null`

Defined in: [types.ts:621](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L621)

***

### last\_final\_url

> **last\_final\_url**: `string` \| `null`

Defined in: [types.ts:622](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L622)

***

### last\_tls\_days\_remaining

> **last\_tls\_days\_remaining**: `number` \| `null`

Defined in: [types.ts:623](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L623)

***

### last\_failed\_assertion\_count

> **last\_failed\_assertion\_count**: `number`

Defined in: [types.ts:624](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L624)

***

### consecutive\_failures

> **consecutive\_failures**: `number`

Defined in: [types.ts:625](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L625)
