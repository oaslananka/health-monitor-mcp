[**health-monitor-mcp v1.0.0**](../../README.md)

***

[health-monitor-mcp](../../README.md) / [types](../README.md) / RegisterServerSchema

# Variable: RegisterServerSchema

> `const` **RegisterServerSchema**: `ZodDiscriminatedUnion`\<`"type"`, \[`ZodObject`\<`object` & `object`, `"strip"`, `ZodTypeAny`, \{ `name`: `string`; `args`: `string`[]; `tags`: `string`[]; `alert_on_down`: `boolean`; `check_interval_minutes`: `number`; `type`: `"http"`; `url`: `string`; `command?`: `string`; \}, \{ `name`: `string`; `args?`: `string`[]; `tags?`: `string`[]; `alert_on_down?`: `boolean`; `check_interval_minutes?`: `number`; `type`: `"http"`; `url`: `string`; `command?`: `string`; \}\>, `ZodObject`\<`object` & `object`, `"strip"`, `ZodTypeAny`, \{ `name`: `string`; `args`: `string`[]; `tags`: `string`[]; `alert_on_down`: `boolean`; `check_interval_minutes`: `number`; `type`: `"sse"`; `url`: `string`; `command?`: `string`; \}, \{ `name`: `string`; `args?`: `string`[]; `tags?`: `string`[]; `alert_on_down?`: `boolean`; `check_interval_minutes?`: `number`; `type`: `"sse"`; `url`: `string`; `command?`: `string`; \}\>, `ZodObject`\<`object` & `object`, `"strip"`, `ZodTypeAny`, \{ `name`: `string`; `args`: `string`[]; `tags`: `string`[]; `alert_on_down`: `boolean`; `check_interval_minutes`: `number`; `type`: `"stdio"`; `url?`: `string`; `command`: `string`; \}, \{ `name`: `string`; `args?`: `string`[]; `tags?`: `string`[]; `alert_on_down?`: `boolean`; `check_interval_minutes?`: `number`; `type`: `"stdio"`; `url?`: `string`; `command`: `string`; \}\>\]\>

Defined in: [types.ts:80](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L80)
