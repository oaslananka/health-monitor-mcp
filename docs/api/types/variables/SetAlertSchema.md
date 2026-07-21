[**health-monitor-mcp**](../../README.md)

***

[health-monitor-mcp](../../README.md) / [types](../README.md) / SetAlertSchema

# Variable: SetAlertSchema

> `const` **SetAlertSchema**: `ZodObject`\<\{ `name`: `ZodEffects`\<`ZodEffects`\<`ZodString`, `string`, `string`\>, `string`, `string`\>; `max_response_time_ms`: `ZodOptional`\<`ZodNumber`\>; `min_uptime_percent`: `ZodOptional`\<`ZodNumber`\>; `consecutive_failures_before_alert`: `ZodDefault`\<`ZodNumber`\>; \}, `"strip"`, `ZodTypeAny`, \{ `name`: `string`; `max_response_time_ms?`: `number`; `min_uptime_percent?`: `number`; `consecutive_failures_before_alert`: `number`; \}, \{ `name`: `string`; `max_response_time_ms?`: `number`; `min_uptime_percent?`: `number`; `consecutive_failures_before_alert?`: `number`; \}\>

Defined in: [types.ts:121](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L121)
