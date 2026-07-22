[**health-monitor-mcp**](../../README.md)

***

[health-monitor-mcp](../../README.md) / [types](../README.md) / GitHubActionsCheckResult

# Interface: GitHubActionsCheckResult

Defined in: [types.ts:340](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L340)

## Properties

### status

> **status**: `"up"` \| `"down"` \| `"timeout"` \| `"error"`

Defined in: [types.ts:341](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L341)

***

### response\_time\_ms

> **response\_time\_ms**: `number` \| `null`

Defined in: [types.ts:342](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L342)

***

### error\_message

> **error\_message**: `string` \| `null`

Defined in: [types.ts:343](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L343)

***

### run

> **run**: [`GitHubActionsRunDetails`](GitHubActionsRunDetails.md) \| `null`

Defined in: [types.ts:344](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L344)

***

### failed\_jobs

> **failed\_jobs**: [`GitHubActionsJobDiagnostic`](GitHubActionsJobDiagnostic.md)[]

Defined in: [types.ts:345](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L345)
