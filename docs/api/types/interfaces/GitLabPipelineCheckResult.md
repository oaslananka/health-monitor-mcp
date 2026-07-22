[**health-monitor-mcp**](../../README.md)

***

[health-monitor-mcp](../../README.md) / [types](../README.md) / GitLabPipelineCheckResult

# Interface: GitLabPipelineCheckResult

Defined in: [types.ts:413](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L413)

## Properties

### status

> **status**: `"up"` \| `"down"` \| `"timeout"` \| `"error"`

Defined in: [types.ts:414](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L414)

***

### response\_time\_ms

> **response\_time\_ms**: `number` \| `null`

Defined in: [types.ts:415](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L415)

***

### error\_message

> **error\_message**: `string` \| `null`

Defined in: [types.ts:416](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L416)

***

### pipeline

> **pipeline**: [`GitLabPipelineDetails`](GitLabPipelineDetails.md) \| `null`

Defined in: [types.ts:417](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L417)

***

### failed\_jobs

> **failed\_jobs**: [`GitLabJobDiagnostic`](GitLabJobDiagnostic.md)[]

Defined in: [types.ts:418](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L418)
