[**health-monitor-mcp**](../../README.md)

***

[health-monitor-mcp](../../README.md) / [types](../README.md) / RegisteredHttpTarget

# Interface: RegisteredHttpTarget

Defined in: [types.ts:681](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L681)

## Properties

### name

> **name**: `string`

Defined in: [types.ts:682](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L682)

***

### url

> **url**: `string`

Defined in: [types.ts:683](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L683)

***

### expected\_statuses

> **expected\_statuses**: `number`[]

Defined in: [types.ts:684](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L684)

***

### header\_assertions

> **header\_assertions**: [`HttpHeaderAssertion`](HttpHeaderAssertion.md)[]

Defined in: [types.ts:685](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L685)

***

### body\_contains

> **body\_contains**: `string`[]

Defined in: [types.ts:686](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L686)

***

### json\_assertions

> **json\_assertions**: [`HttpJsonAssertion`](HttpJsonAssertion.md)[]

Defined in: [types.ts:687](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L687)

***

### tls\_expiry\_days

> **tls\_expiry\_days**: `number` \| `null`

Defined in: [types.ts:688](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L688)

***

### tags

> **tags**: `string`[]

Defined in: [types.ts:689](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L689)

***

### check\_interval\_minutes

> **check\_interval\_minutes**: `number`

Defined in: [types.ts:690](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L690)

***

### created\_at

> **created\_at**: `number`

Defined in: [types.ts:691](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L691)

***

### last\_checked

> **last\_checked**: `number` \| `null`

Defined in: [types.ts:692](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L692)

***

### last\_status

> **last\_status**: `"up"` \| `"down"` \| `"timeout"` \| `"error"` \| `"unknown"`

Defined in: [types.ts:693](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L693)

***

### last\_response\_time\_ms

> **last\_response\_time\_ms**: `number` \| `null`

Defined in: [types.ts:694](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L694)

***

### last\_status\_code

> **last\_status\_code**: `number` \| `null`

Defined in: [types.ts:695](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L695)

***

### last\_final\_url

> **last\_final\_url**: `string` \| `null`

Defined in: [types.ts:696](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L696)

***

### last\_tls\_days\_remaining

> **last\_tls\_days\_remaining**: `number` \| `null`

Defined in: [types.ts:697](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L697)

***

### last\_failed\_assertion\_count

> **last\_failed\_assertion\_count**: `number`

Defined in: [types.ts:698](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L698)

***

### consecutive\_failures

> **consecutive\_failures**: `number`

Defined in: [types.ts:699](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L699)
