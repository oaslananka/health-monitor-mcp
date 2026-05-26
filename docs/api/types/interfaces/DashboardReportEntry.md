[**mcp-health-monitor v1.0.5**](../../README.md)

***

[mcp-health-monitor](../../README.md) / [types](../README.md) / DashboardReportEntry

# Interface: DashboardReportEntry

Defined in: [types.ts:254](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L254)

## Properties

### name

> **name**: `string`

Defined in: [types.ts:255](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L255)

***

### current\_status

> **current\_status**: `"up"` \| `"down"` \| `"timeout"` \| `"error"` \| `"unknown"`

Defined in: [types.ts:256](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L256)

***

### uptime\_percent

> **uptime\_percent**: `number` \| `null`

Defined in: [types.ts:257](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L257)

***

### avg\_response\_time\_ms

> **avg\_response\_time\_ms**: `number` \| `null`

Defined in: [types.ts:258](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L258)

***

### p50\_response\_time\_ms

> **p50\_response\_time\_ms**: `number` \| `null`

Defined in: [types.ts:259](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L259)

***

### p95\_response\_time\_ms

> **p95\_response\_time\_ms**: `number` \| `null`

Defined in: [types.ts:260](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L260)

***

### total\_checks

> **total\_checks**: `number`

Defined in: [types.ts:261](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L261)

***

### consecutive\_failures

> **consecutive\_failures**: `number`

Defined in: [types.ts:262](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L262)

***

### tool\_count

> **tool\_count**: `number` \| `null`

Defined in: [types.ts:263](https://github.com/oaslananka/health-monitor-mcp/blob/main/src/types.ts#L263)
