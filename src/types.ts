import { z } from 'zod/v3';

export const McpServerTypeSchema = z.enum(['http', 'stdio', 'sse']);
export const HealthStatusSchema = z.enum(['up', 'down', 'timeout', 'error']);
export const ListableStatusSchema = z.enum(['up', 'down', 'unknown']);
export const AlertFindingTypeSchema = z.enum([
  'down',
  'response_time',
  'uptime',
  'consecutive_failures'
]);

const MARKDOWN_TABLE_UNSAFE_PATTERN = /[|`<>]/;

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });
}

const SafeNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((value) => !hasControlCharacter(value), 'Control characters are not allowed')
  .refine(
    (value) => !MARKDOWN_TABLE_UNSAFE_PATTERN.test(value),
    'Markdown table control characters are not allowed'
  );

const SafeTagSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .refine((value) => !hasControlCharacter(value), 'Control characters are not allowed')
  .refine(
    (value) => !MARKDOWN_TABLE_UNSAFE_PATTERN.test(value),
    'Markdown table control characters are not allowed'
  );

const SafeArgSchema = z
  .string()
  .min(1)
  .max(200)
  .refine((value) => !hasControlCharacter(value), 'Control characters are not allowed');

const HttpUrlSchema = z
  .string()
  .trim()
  .url()
  .max(2048)
  .refine((value) => !hasControlCharacter(value), 'Control characters are not allowed')
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }, 'URL protocol must be http or https');

const CommandSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((value) => !hasControlCharacter(value), 'Control characters are not allowed');

const RegisterServerBaseSchema = z.object({
  name: SafeNameSchema.describe('Unique name for this MCP server'),
  args: z.array(SafeArgSchema).max(50).default([]).describe('Args for stdio command'),
  tags: z.array(SafeTagSchema).max(20).default([]).describe('Tags for grouping'),
  alert_on_down: z.boolean().default(true).describe('Alert when server goes down'),
  check_interval_minutes: z.number().int().min(1).max(60).default(5)
});

export const RegisterServerSchema = z.discriminatedUnion('type', [
  RegisterServerBaseSchema.extend({
    type: z.literal('http').describe('Streamable HTTP transport'),
    url: HttpUrlSchema.describe('URL for http servers (e.g. https://example.com/mcp)'),
    command: CommandSchema.optional()
  }),
  RegisterServerBaseSchema.extend({
    type: z.literal('sse').describe('Legacy SSE transport'),
    url: HttpUrlSchema.describe('URL for sse servers (e.g. https://example.com/sse)'),
    command: CommandSchema.optional()
  }),
  RegisterServerBaseSchema.extend({
    type: z.literal('stdio').describe('Local stdio transport'),
    url: HttpUrlSchema.optional(),
    command: CommandSchema.describe('Command for stdio servers (e.g. npx mcp-debug-recorder)')
  })
]);

export const CheckServerSchema = z.object({
  name: SafeNameSchema.describe('Server name to check'),
  timeout_ms: z.number().int().min(1000).max(30000).default(5000)
});

export const CheckAllSchema = z.object({
  timeout_ms: z.number().int().min(1000).max(30000).default(5000),
  tags: z.array(SafeTagSchema).max(20).optional().describe('Filter by tags')
});

export const GetUptimeSchema = z.object({
  name: SafeNameSchema.describe('Server name'),
  hours: z.number().int().min(1).max(720).default(24)
});

export const SetAlertSchema = z.object({
  name: SafeNameSchema.describe('Server name'),
  max_response_time_ms: z.number().int().optional().describe('Alert if response time exceeds this'),
  min_uptime_percent: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe('Alert if uptime drops below this'),
  consecutive_failures_before_alert: z.number().int().min(1).max(10).default(3)
});

export const GetDashboardSchema = z.object({
  hours: z.number().int().min(1).max(168).default(24),
  include_tool_stats: z.boolean().default(true)
});

export const GetReportSchema = z.object({
  hours: z.number().int().min(1).max(168).default(24)
});

export const UnregisterSchema = z.object({
  name: SafeNameSchema
});

export const ListServersSchema = z.object({
  tags: z.array(SafeTagSchema).max(20).optional(),
  status: ListableStatusSchema.optional()
});

export const EmptySchema = z.object({});

export type McpServerType = z.infer<typeof McpServerTypeSchema>;
export type HealthStatus = z.infer<typeof HealthStatusSchema>;
export type RegisterServerInput = z.infer<typeof RegisterServerSchema>;
export type CheckServerInput = z.infer<typeof CheckServerSchema>;
export type CheckAllInput = z.infer<typeof CheckAllSchema>;
export type GetUptimeInput = z.infer<typeof GetUptimeSchema>;
export type SetAlertInput = z.infer<typeof SetAlertSchema>;
export type GetDashboardInput = z.infer<typeof GetDashboardSchema>;
export type GetReportInput = z.infer<typeof GetReportSchema>;
export type UnregisterInput = z.infer<typeof UnregisterSchema>;
export type ListServersInput = z.infer<typeof ListServersSchema>;
export type AlertFindingType = z.infer<typeof AlertFindingTypeSchema>;

export interface HealthRecord {
  id: number;
  server_name: string;
  timestamp: number;
  status: HealthStatus;
  response_time_ms: number | null;
  tool_count: number | null;
  error_message: string | null;
  tools_snapshot: string | null;
}

export interface RegisteredServer {
  name: string;
  type: McpServerType;
  url: string | null;
  command: string | null;
  args: string[];
  tags: string[];
  alert_on_down: boolean;
  check_interval_minutes: number;
  created_at: number;
  last_checked: number | null;
  last_status: HealthStatus | 'unknown';
  last_response_time_ms: number | null;
  consecutive_failures: number;
}

export interface ServerStatus {
  name: string;
  type: McpServerType;
  url?: string;
  command?: string;
  status: 'up' | 'down' | 'unknown';
  last_checked: number | null;
  last_response_time_ms: number | null;
  tool_count: number | null;
  uptime_24h_percent: number | null;
  consecutive_failures: number;
  tags: string[];
}

export interface DashboardReportEntry {
  name: string;
  current_status: RegisteredServer['last_status'];
  uptime_percent: number | null;
  avg_response_time_ms: number | null;
  p50_response_time_ms: number | null;
  p95_response_time_ms: number | null;
  total_checks: number;
  consecutive_failures: number;
  tool_count: number | null;
}

export interface AlertConfigRecord {
  server_name: string;
  max_response_time_ms: number | null;
  min_uptime_percent: number | null;
  consecutive_failures_before_alert: number;
}

export interface AlertFinding {
  type: AlertFindingType;
  message: string;
  actual: number | string;
  threshold: number | string;
}

export interface AlertEvaluation {
  has_alerts: boolean;
  findings: AlertFinding[];
}

export interface CheckResult {
  status: HealthStatus;
  response_time_ms: number | null;
  tool_count: number | null;
  error_message: string | null;
  tools: string[] | null;
}
