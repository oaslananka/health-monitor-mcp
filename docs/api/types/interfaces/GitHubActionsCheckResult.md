[**health-monitor-mcp**](../../README.md)

***

[health-monitor-mcp](../../README.md) / [types](../README.md) / GitHubActionsCheckResult

# Interface: GitHubActionsCheckResult

Defined in: [types.ts:519](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L519)

## Properties

### status

> **status**: `"up"` \| `"down"` \| `"timeout"` \| `"error"`

Defined in: [types.ts:520](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L520)

***

### response\_time\_ms

> **response\_time\_ms**: `number` \| `null`

Defined in: [types.ts:521](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L521)

***

### error\_message

> **error\_message**: `string` \| `null`

Defined in: [types.ts:522](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L522)

***

### run

> **run**: [`GitHubActionsRunDetails`](GitHubActionsRunDetails.md) \| `null`

Defined in: [types.ts:523](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L523)

***

### failed\_jobs

> **failed\_jobs**: [`GitHubActionsJobDiagnostic`](GitHubActionsJobDiagnostic.md)[]

Defined in: [types.ts:524](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L524)
