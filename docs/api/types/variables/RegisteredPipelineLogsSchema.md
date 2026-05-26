[**mcp-health-monitor v1.0.5**](../../README.md)

***

[mcp-health-monitor](../../README.md) / [types](../README.md) / RegisteredPipelineLogsSchema

# Variable: RegisteredPipelineLogsSchema

> `const` **RegisteredPipelineLogsSchema**: `ZodObject`\<\{ `group_name`: `ZodString`; `pipeline_name`: `ZodString`; `build_id`: `ZodOptional`\<`ZodNumber`\>; `failed_only`: `ZodDefault`\<`ZodBoolean`\>; \}, `"strip"`, `ZodTypeAny`, \{ `group_name`: `string`; `pipeline_name`: `string`; `build_id?`: `number`; `failed_only`: `boolean`; \}, \{ `group_name`: `string`; `pipeline_name`: `string`; `build_id?`: `number`; `failed_only?`: `boolean`; \}\>

Defined in: [types.ts:176](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L176)
