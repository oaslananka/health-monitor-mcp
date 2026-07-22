[**health-monitor-mcp**](../../README.md)

***

[health-monitor-mcp](../../README.md) / [types](../README.md) / RegisterGitHubActionsSchema

# Variable: RegisterGitHubActionsSchema

> `const` **RegisterGitHubActionsSchema**: `ZodObject`\<\{ `name`: `ZodEffects`\<`ZodEffects`\<`ZodString`, `string`, `string`\>, `string`, `string`\>; `owner`: `ZodString`; `repository`: `ZodString`; `workflow`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `branch`: `ZodOptional`\<`ZodEffects`\<`ZodString`, `string`, `string`\>\>; `token_env`: `ZodDefault`\<`ZodString`\>; `tags`: `ZodDefault`\<`ZodArray`\<`ZodEffects`\<`ZodEffects`\<`ZodString`, `string`, `string`\>, `string`, `string`\>, `"many"`\>\>; `check_interval_minutes`: `ZodDefault`\<`ZodNumber`\>; \}, `"strip"`, `ZodTypeAny`, \{ `name`: `string`; `owner`: `string`; `repository`: `string`; `workflow`: `string`; `branch?`: `string`; `token_env`: `string`; `tags`: `string`[]; `check_interval_minutes`: `number`; \}, \{ `name`: `string`; `owner`: `string`; `repository`: `string`; `workflow`: `string`; `branch?`: `string`; `token_env?`: `string`; `tags?`: `string`[]; `check_interval_minutes?`: `number`; \}\>

Defined in: [types.ts:188](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L188)
