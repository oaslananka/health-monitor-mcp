[**health-monitor-mcp**](../../README.md)

***

[health-monitor-mcp](../../README.md) / [types](../README.md) / RegisteredWebhookTarget

# Interface: RegisteredWebhookTarget

Defined in: [types.ts:461](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L461)

## Properties

### name

> **name**: `string`

Defined in: [types.ts:462](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L462)

***

### url

> **url**: `string`

Defined in: [types.ts:463](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L463)

***

### secret

> **secret**: `string` \| `null`

Defined in: [types.ts:464](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L464)

***

### events

> **events**: (`"up"` \| `"down"` \| `"alert"`)[]

Defined in: [types.ts:465](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L465)

***

### tags

> **tags**: `string`[]

Defined in: [types.ts:466](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L466)

***

### check\_interval\_minutes

> **check\_interval\_minutes**: `number`

Defined in: [types.ts:467](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L467)

***

### created\_at

> **created\_at**: `number`

Defined in: [types.ts:468](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L468)

***

### last\_tested

> **last\_tested**: `number` \| `null`

Defined in: [types.ts:469](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L469)

***

### last\_test\_status

> **last\_test\_status**: `"delivered"` \| `"failed"` \| `null`

Defined in: [types.ts:470](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L470)

***

### last\_test\_latency\_ms

> **last\_test\_latency\_ms**: `number` \| `null`

Defined in: [types.ts:471](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L471)

***

### last\_test\_error

> **last\_test\_error**: `string` \| `null`

Defined in: [types.ts:472](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L472)
