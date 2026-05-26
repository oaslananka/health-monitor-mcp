[**mcp-health-monitor v1.0.5**](../../README.md)

***

[mcp-health-monitor](../../README.md) / [checker](../README.md) / checkServer

# Function: checkServer()

> **checkServer**(`server`, `timeoutMs`, `options?`): `Promise`\<[`CheckResult`](../../types/interfaces/CheckResult.md)\>

Defined in: [checker.ts:283](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/checker.ts#L283)

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
