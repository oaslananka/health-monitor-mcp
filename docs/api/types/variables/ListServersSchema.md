[**health-monitor-mcp**](../../README.md)

***

[health-monitor-mcp](../../README.md) / [types](../README.md) / ListServersSchema

# Variable: ListServersSchema

> `const` **ListServersSchema**: `ZodObject`\<\{ `tags`: `ZodOptional`\<`ZodArray`\<`ZodEffects`\<`ZodEffects`\<`ZodString`, `string`, `string`\>, `string`, `string`\>, `"many"`\>\>; `status`: `ZodOptional`\<`ZodEnum`\<\[`"up"`, `"down"`, `"unknown"`\]\>\>; \}, `"strip"`, `ZodTypeAny`, \{ `tags?`: `string`[]; `status?`: `"up"` \| `"down"` \| `"unknown"`; \}, \{ `tags?`: `string`[]; `status?`: `"up"` \| `"down"` \| `"unknown"`; \}\>

Defined in: [types.ts:148](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L148)
