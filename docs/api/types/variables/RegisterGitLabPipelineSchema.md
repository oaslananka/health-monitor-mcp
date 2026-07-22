[**health-monitor-mcp**](../../README.md)

***

[health-monitor-mcp](../../README.md) / [types](../README.md) / RegisterGitLabPipelineSchema

# Variable: RegisterGitLabPipelineSchema

> `const` **RegisterGitLabPipelineSchema**: `ZodObject`\<\{ `name`: `ZodEffects`\<`ZodEffects`\<`ZodString`, `string`, `string`\>, `string`, `string`\>; `base_url`: `ZodDefault`\<`ZodEffects`\<`ZodEffects`\<`ZodString`, `string`, `string`\>, `string`, `string`\>\>; `project`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `ref`: `ZodOptional`\<`ZodEffects`\<`ZodString`, `string`, `string`\>\>; `token_env`: `ZodDefault`\<`ZodString`\>; `tags`: `ZodDefault`\<`ZodArray`\<`ZodEffects`\<`ZodEffects`\<`ZodString`, `string`, `string`\>, `string`, `string`\>, `"many"`\>\>; `check_interval_minutes`: `ZodDefault`\<`ZodNumber`\>; \}, `"strip"`, `ZodTypeAny`, \{ `name`: `string`; `base_url`: `string`; `project`: `string`; `ref?`: `string`; `token_env`: `string`; `tags`: `string`[]; `check_interval_minutes`: `number`; \}, \{ `name`: `string`; `base_url?`: `string`; `project`: `string`; `ref?`: `string`; `token_env?`: `string`; `tags?`: `string`[]; `check_interval_minutes?`: `number`; \}\>

Defined in: [types.ts:255](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L255)
