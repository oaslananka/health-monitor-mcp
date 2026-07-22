[**health-monitor-mcp**](../../README.md)

***

[health-monitor-mcp](../../README.md) / [types](../README.md) / GitHubActionsCheckResult

# Interface: GitHubActionsCheckResult

Defined in: [types.ts:268](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L268)

## Properties

### status

> **status**: `"up"` \| `"down"` \| `"timeout"` \| `"error"`

Defined in: [types.ts:269](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L269)

***

### response\_time\_ms

> **response\_time\_ms**: `number` \| `null`

Defined in: [types.ts:270](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L270)

***

### error\_message

> **error\_message**: `string` \| `null`

Defined in: [types.ts:271](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L271)

***

### run

> **run**: [`GitHubActionsRunDetails`](GitHubActionsRunDetails.md) \| `null`

Defined in: [types.ts:272](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L272)

***

### failed\_jobs

> **failed\_jobs**: [`GitHubActionsJobDiagnostic`](GitHubActionsJobDiagnostic.md)[]

Defined in: [types.ts:273](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L273)
