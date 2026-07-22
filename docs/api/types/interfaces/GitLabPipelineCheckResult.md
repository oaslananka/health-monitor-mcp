[**health-monitor-mcp**](../../README.md)

***

[health-monitor-mcp](../../README.md) / [types](../README.md) / GitLabPipelineCheckResult

# Interface: GitLabPipelineCheckResult

Defined in: [types.ts:520](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L520)

## Properties

### status

> **status**: `"up"` \| `"down"` \| `"timeout"` \| `"error"`

Defined in: [types.ts:521](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L521)

***

### response\_time\_ms

> **response\_time\_ms**: `number` \| `null`

Defined in: [types.ts:522](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L522)

***

### error\_message

> **error\_message**: `string` \| `null`

Defined in: [types.ts:523](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L523)

***

### pipeline

> **pipeline**: [`GitLabPipelineDetails`](GitLabPipelineDetails.md) \| `null`

Defined in: [types.ts:524](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L524)

***

### failed\_jobs

> **failed\_jobs**: [`GitLabJobDiagnostic`](GitLabJobDiagnostic.md)[]

Defined in: [types.ts:525](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L525)
