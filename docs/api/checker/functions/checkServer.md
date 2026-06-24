[**health-monitor-mcp v1.0.0**](../../README.md)

***

[health-monitor-mcp](../../README.md) / [checker](../README.md) / checkServer

# Function: checkServer()

> **checkServer**(`server`, `timeoutMs`, `options?`): `Promise`\<[`CheckResult`](../../types/interfaces/CheckResult.md)\>

Defined in: [checker.ts:259](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/checker.ts#L259)

## Parameters

### server

`Pick`\<[`RegisteredServer`](../../types/interfaces/RegisteredServer.md), `"type"`\> & `object`

### timeoutMs

`number`

### options?

#### allowStdio?

`boolean`

## Returns

`Promise`\<[`CheckResult`](../../types/interfaces/CheckResult.md)\>
