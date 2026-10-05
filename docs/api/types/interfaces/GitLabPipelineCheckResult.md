[**health-monitor-mcp**](../../README.md)

***

[health-monitor-mcp](../../README.md) / [types](../README.md) / GitLabPipelineCheckResult

# Interface: GitLabPipelineCheckResult

Defined in: [types.ts:592](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L592)

## Properties

### status

> **status**: `"up"` \| `"down"` \| `"timeout"` \| `"error"`

Defined in: [types.ts:593](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L593)

***

### response\_time\_ms

> **response\_time\_ms**: `number` \| `null`

Defined in: [types.ts:594](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L594)

***

### error\_message

> **error\_message**: `string` \| `null`

Defined in: [types.ts:595](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L595)

***

### pipeline

> **pipeline**: [`GitLabPipelineDetails`](GitLabPipelineDetails.md) \| `null`

Defined in: [types.ts:596](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L596)

***

### failed\_jobs

> **failed\_jobs**: [`GitLabJobDiagnostic`](GitLabJobDiagnostic.md)[]

Defined in: [types.ts:597](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L597)
