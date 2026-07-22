[**health-monitor-mcp**](../../README.md)

***

[health-monitor-mcp](../../README.md) / [types](../README.md) / GitHubActionsCheckResult

# Interface: GitHubActionsCheckResult

Defined in: [types.ts:447](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L447)

## Properties

### status

> **status**: `"up"` \| `"down"` \| `"timeout"` \| `"error"`

Defined in: [types.ts:448](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L448)

***

### response\_time\_ms

> **response\_time\_ms**: `number` \| `null`

Defined in: [types.ts:449](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L449)

***

### error\_message

> **error\_message**: `string` \| `null`

Defined in: [types.ts:450](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L450)

***

### run

> **run**: [`GitHubActionsRunDetails`](GitHubActionsRunDetails.md) \| `null`

Defined in: [types.ts:451](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L451)

***

### failed\_jobs

> **failed\_jobs**: [`GitHubActionsJobDiagnostic`](GitHubActionsJobDiagnostic.md)[]

Defined in: [types.ts:452](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L452)
