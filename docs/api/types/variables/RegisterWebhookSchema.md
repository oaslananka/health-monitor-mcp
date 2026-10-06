[**health-monitor-mcp**](../../README.md)

***

[health-monitor-mcp](../../README.md) / [types](../README.md) / RegisterWebhookSchema

# Variable: RegisterWebhookSchema

> `const` **RegisterWebhookSchema**: `ZodObject`\<\{ `name`: `ZodEffects`\<`ZodEffects`\<`ZodString`, `string`, `string`\>, `string`, `string`\>; `url`: `ZodEffects`\<`ZodEffects`\<`ZodString`, `string`, `string`\>, `string`, `string`\>; `secret`: `ZodOptional`\<`ZodString`\>; `events`: `ZodDefault`\<`ZodArray`\<`ZodEnum`\<\[`"down"`, `"up"`, `"alert"`\]\>, `"many"`\>\>; `tags`: `ZodDefault`\<`ZodArray`\<`ZodEffects`\<`ZodEffects`\<`ZodString`, `string`, `string`\>, `string`, `string`\>, `"many"`\>\>; `check_interval_minutes`: `ZodDefault`\<`ZodNumber`\>; \}, `"strip"`, `ZodTypeAny`, \{ `name`: `string`; `url`: `string`; `secret?`: `string`; `events`: (`"up"` \| `"down"` \| `"alert"`)[]; `tags`: `string`[]; `check_interval_minutes`: `number`; \}, \{ `name`: `string`; `url`: `string`; `secret?`: `string`; `events?`: (`"up"` \| `"down"` \| `"alert"`)[]; `tags?`: `string`[]; `check_interval_minutes?`: `number`; \}\>

Defined in: [types.ts:420](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L420)
