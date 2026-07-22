import { z } from 'zod/v3';

import { normalizeGitLabBaseUrl } from './gitlab-origin.js';

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
    type: z.literal('http').describe('Streamable HTTP MCP transport'),
    url: HttpUrlSchema.describe('Streamable HTTP MCP endpoint URL (e.g. https://example.com/mcp)'),
    command: CommandSchema.optional()
  }),
  RegisterServerBaseSchema.extend({
    type: z.literal('sse').describe('Legacy Server-Sent Events transport for older MCP servers'),
    url: HttpUrlSchema.describe('Legacy SSE endpoint URL (e.g. https://example.com/sse)'),
    command: CommandSchema.optional()
  }),
  RegisterServerBaseSchema.extend({
    type: z
      .literal('stdio')
      .describe('Trusted local stdio process transport; explicit opt-in required'),
    url: HttpUrlSchema.optional(),
    command: CommandSchema.describe(
      'Single local executable for stdio servers; put flags and package names in args'
    )
  })
]);

export const CheckServerSchema = z.object({
  name: SafeNameSchema.describe('Server name to check'),
  timeout_ms: z.number().int().min(1000).max(30000).default(5000)
});

export const CheckAllSchema = z.object({
  timeout_ms: z.number().int().min(1000).max(30000).default(5000),
  tags: z
    .array(SafeTagSchema)
    .max(20)
    .optional()
    .describe('Filter targets by registered server tags')
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

const GitHubSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(
    /^[A-Za-z0-9_.-]+$/,
    'GitHub owner and repository names may use letters, numbers, dot, underscore, and hyphen only'
  );

const GitHubWorkflowSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine(
    (value) => /^\d+$/.test(value) || /^[A-Za-z0-9_.-]+\.ya?ml$/.test(value),
    'Workflow must be a numeric ID or a .yml/.yaml filename'
  );

const GitHubBranchSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine((value) => !hasControlCharacter(value), 'Control characters are not allowed');

const TokenEnvironmentSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(
    /^[A-Z_][A-Z0-9_]*$/,
    'Token environment variable must use uppercase shell variable syntax'
  );

export const RegisterGitHubActionsSchema = z.object({
  name: SafeNameSchema.describe('Unique local name for this GitHub Actions target'),
  owner: GitHubSlugSchema.describe('GitHub user or organization'),
  repository: GitHubSlugSchema.describe('GitHub repository name'),
  workflow: GitHubWorkflowSchema.describe('Workflow numeric ID or .yml/.yaml filename'),
  branch: GitHubBranchSchema.optional().describe('Optional branch filter for workflow runs'),
  token_env: TokenEnvironmentSchema.default('GITHUB_TOKEN').describe(
    'Environment variable containing a GitHub token; the token value is never persisted'
  ),
  tags: z.array(SafeTagSchema).max(20).default([]).describe('Tags for grouping'),
  check_interval_minutes: z.number().int().min(1).max(60).default(5)
});

export const CheckGitHubActionsSchema = z.object({
  name: SafeNameSchema.describe('GitHub Actions target name to check'),
  timeout_ms: z.number().int().min(1000).max(30000).default(5000)
});

export const ListGitHubActionsSchema = z.object({
  tags: z.array(SafeTagSchema).max(20).optional(),
  status: ListableStatusSchema.optional()
});

export const UnregisterGitHubActionsSchema = z.object({
  name: SafeNameSchema
});

const GitLabBaseUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine((value) => {
    try {
      normalizeGitLabBaseUrl(value);
      return true;
    } catch {
      return false;
    }
  }, 'GitLab base URL must be an HTTPS origin without credentials, path, query, or fragment')
  .transform((value) => normalizeGitLabBaseUrl(value));

const GitLabProjectSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(
    /^(?:\d+|[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+)$/,
    'GitLab project must be a numeric ID or namespace/project path'
  )
  .refine(
    (value) =>
      /^\d+$/.test(value) ||
      value.split('/').every((segment) => segment !== '.' && segment !== '..'),
    'GitLab project path cannot contain dot segments'
  );

const GitLabRefSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine((value) => !hasControlCharacter(value), 'Control characters are not allowed');

export const RegisterGitLabPipelineSchema = z.object({
  name: SafeNameSchema.describe('Unique local name for this GitLab pipeline target'),
  base_url: GitLabBaseUrlSchema.default('https://gitlab.com').describe(
    'GitLab HTTPS origin; self-hosted origins require HEALTH_MONITOR_GITLAB_BASE_URL_ALLOWLIST'
  ),
  project: GitLabProjectSchema.describe('Numeric project ID or namespace/project path'),
  ref: GitLabRefSchema.optional().describe('Optional branch or tag filter'),
  token_env: TokenEnvironmentSchema.default('GITLAB_TOKEN').describe(
    'Environment variable containing a GitLab token; the token value is never persisted'
  ),
  tags: z.array(SafeTagSchema).max(20).default([]).describe('Tags for grouping'),
  check_interval_minutes: z.number().int().min(1).max(60).default(5)
});

export const CheckGitLabPipelineSchema = z.object({
  name: SafeNameSchema.describe('GitLab pipeline target name to check'),
  timeout_ms: z.number().int().min(1000).max(30000).default(5000)
});

export const ListGitLabPipelinesSchema = z.object({
  tags: z.array(SafeTagSchema).max(20).optional(),
  status: ListableStatusSchema.optional()
});

export const UnregisterGitLabPipelineSchema = z.object({
  name: SafeNameSchema
});

const HttpTargetUrlSchema = z
  .string()
  .trim()
  .url()
  .max(2048)
  .refine((value) => !hasControlCharacter(value), 'Control characters are not allowed')
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return (
        (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
        parsed.hostname.length > 0 &&
        parsed.username === '' &&
        parsed.password === '' &&
        parsed.hash === ''
      );
    } catch {
      return false;
    }
  }, 'HTTP target URL must use http or https without credentials or fragment');

const HttpHeaderNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/, 'Invalid HTTP header name')
  .transform((value) => value.toLowerCase());

const HttpAssertionValueSchema = z.union([
  z.string().max(2048),
  z.number().finite(),
  z.boolean(),
  z.null()
]);

const HttpJsonPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/, 'JSON path must use dot-separated keys')
  .refine(
    (value) =>
      value
        .split('.')
        .every((segment) => !['__proto__', 'prototype', 'constructor'].includes(segment)),
    'JSON path contains a forbidden prototype segment'
  );

export const RegisterHttpTargetSchema = z
  .object({
    name: SafeNameSchema.describe('Unique local name for this HTTP target'),
    url: HttpTargetUrlSchema.describe('HTTP or HTTPS endpoint URL'),
    expected_statuses: z.array(z.number().int().min(100).max(599)).min(1).max(20).default([200]),
    header_assertions: z
      .array(
        z.object({
          name: HttpHeaderNameSchema,
          equals: z.string().max(2048)
        })
      )
      .max(10)
      .default([]),
    body_contains: z.array(z.string().min(1).max(512)).max(5).default([]),
    json_assertions: z
      .array(
        z.object({
          path: HttpJsonPathSchema,
          equals: HttpAssertionValueSchema
        })
      )
      .max(10)
      .default([]),
    tls_expiry_days: z.number().int().min(1).max(3650).optional(),
    tags: z.array(SafeTagSchema).max(20).default([]),
    check_interval_minutes: z.number().int().min(1).max(60).default(5)
  })
  .superRefine((value, context) => {
    if (value.tls_expiry_days !== undefined && new URL(value.url).protocol !== 'https:') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tls_expiry_days'],
        message: 'TLS expiry monitoring requires an HTTPS URL'
      });
    }
  });

export const CheckHttpTargetSchema = z.object({
  name: SafeNameSchema.describe('HTTP target name to check'),
  timeout_ms: z.number().int().min(1000).max(30000).default(5000)
});

export const ListHttpTargetsSchema = z.object({
  tags: z.array(SafeTagSchema).max(20).optional(),
  status: ListableStatusSchema.optional()
});

export const UnregisterHttpTargetSchema = z.object({
  name: SafeNameSchema
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
export type RegisterGitHubActionsInput = z.infer<typeof RegisterGitHubActionsSchema>;
export type CheckGitHubActionsInput = z.infer<typeof CheckGitHubActionsSchema>;
export type ListGitHubActionsInput = z.infer<typeof ListGitHubActionsSchema>;
export type UnregisterGitHubActionsInput = z.infer<typeof UnregisterGitHubActionsSchema>;
export type RegisterGitLabPipelineInput = z.infer<typeof RegisterGitLabPipelineSchema>;
export type CheckGitLabPipelineInput = z.infer<typeof CheckGitLabPipelineSchema>;
export type ListGitLabPipelinesInput = z.infer<typeof ListGitLabPipelinesSchema>;
export type UnregisterGitLabPipelineInput = z.infer<typeof UnregisterGitLabPipelineSchema>;

export type RegisterHttpTargetInput = z.infer<typeof RegisterHttpTargetSchema>;
export type CheckHttpTargetInput = z.infer<typeof CheckHttpTargetSchema>;
export type ListHttpTargetsInput = z.infer<typeof ListHttpTargetsSchema>;
export type UnregisterHttpTargetInput = z.infer<typeof UnregisterHttpTargetSchema>;
export type AlertFindingType = z.infer<typeof AlertFindingTypeSchema>;

export interface GitHubActionsStepDiagnostic {
  number: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface GitHubActionsJobDiagnostic {
  name: string;
  url: string;
  status: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
  failed_steps: GitHubActionsStepDiagnostic[];
}

export interface GitHubActionsRunDetails {
  id: number;
  workflow_name: string;
  run_number: number;
  run_attempt: number;
  status: string;
  conclusion: string | null;
  event: string;
  branch: string | null;
  commit_sha: string;
  url: string;
  created_at: string;
  updated_at: string;
}

export interface GitHubActionsCheckResult {
  status: HealthStatus;
  response_time_ms: number | null;
  error_message: string | null;
  run: GitHubActionsRunDetails | null;
  failed_jobs: GitHubActionsJobDiagnostic[];
}

export interface RegisteredGitHubActionsTarget {
  name: string;
  owner: string;
  repository: string;
  workflow: string;
  branch: string | null;
  token_env: string;
  tags: string[];
  check_interval_minutes: number;
  created_at: number;
  last_checked: number | null;
  last_status: HealthStatus | 'unknown';
  last_response_time_ms: number | null;
  last_run_id: number | null;
  last_conclusion: string | null;
  last_run_url: string | null;
  consecutive_failures: number;
}

export interface GitHubActionsCheckRecord {
  id: number;
  target_name: string;
  timestamp: number;
  status: HealthStatus;
  response_time_ms: number | null;
  run_id: number | null;
  workflow_name: string | null;
  run_number: number | null;
  run_attempt: number | null;
  run_status: string | null;
  conclusion: string | null;
  event: string | null;
  branch: string | null;
  commit_sha: string | null;
  run_url: string | null;
  error_message: string | null;
  failed_jobs: string | null;
}

export interface GitLabJobDiagnostic {
  id: number;
  name: string;
  stage: string;
  status: string;
  ref: string | null;
  commit_sha: string;
  url: string;
  started_at: string | null;
  finished_at: string | null;
  trace_excerpt: string | null;
  trace_error: string | null;
}

export interface GitLabPipelineDetails {
  id: number;
  iid: number;
  status: string;
  ref: string;
  commit_sha: string;
  source: string;
  url: string;
  created_at: string;
  updated_at: string;
}

export interface GitLabPipelineCheckResult {
  status: HealthStatus;
  response_time_ms: number | null;
  error_message: string | null;
  pipeline: GitLabPipelineDetails | null;
  failed_jobs: GitLabJobDiagnostic[];
}

export interface RegisteredGitLabPipelineTarget {
  name: string;
  base_url: string;
  project: string;
  ref: string | null;
  token_env: string;
  tags: string[];
  check_interval_minutes: number;
  created_at: number;
  last_checked: number | null;
  last_status: HealthStatus | 'unknown';
  last_response_time_ms: number | null;
  last_pipeline_id: number | null;
  last_pipeline_status: string | null;
  last_pipeline_url: string | null;
  consecutive_failures: number;
}

export interface GitLabPipelineCheckRecord {
  id: number;
  target_name: string;
  timestamp: number;
  status: HealthStatus;
  response_time_ms: number | null;
  pipeline_id: number | null;
  pipeline_iid: number | null;
  pipeline_status: string | null;
  ref: string | null;
  commit_sha: string | null;
  source: string | null;
  pipeline_url: string | null;
  error_message: string | null;
  failed_jobs: string | null;
}

export interface HttpHeaderAssertion {
  name: string;
  equals: string;
}

export type HttpAssertionValue = string | number | boolean | null;

export interface HttpJsonAssertion {
  path: string;
  equals: HttpAssertionValue;
}

export interface HttpAssertionDiagnostic {
  type: 'status' | 'header' | 'body_contains' | 'json_equals' | 'tls_expiry';
  passed: boolean;
  path: string | null;
  expected: HttpAssertionValue;
  actual: HttpAssertionValue;
  message: string;
}

export interface HttpTlsDetails {
  subject_cn: string | null;
  issuer_cn: string | null;
  valid_from: string;
  valid_to: string;
  days_remaining: number;
}

export interface HttpResponseDetails {
  status_code: number;
  final_url: string;
  redirect_count: number;
  content_type: string | null;
  content_length: number | null;
  tls: HttpTlsDetails | null;
}

export interface HttpCheckResult {
  status: HealthStatus;
  response_time_ms: number | null;
  error_message: string | null;
  response: HttpResponseDetails | null;
  assertions: HttpAssertionDiagnostic[];
}

export interface RegisteredHttpTarget {
  name: string;
  url: string;
  expected_statuses: number[];
  header_assertions: HttpHeaderAssertion[];
  body_contains: string[];
  json_assertions: HttpJsonAssertion[];
  tls_expiry_days: number | null;
  tags: string[];
  check_interval_minutes: number;
  created_at: number;
  last_checked: number | null;
  last_status: HealthStatus | 'unknown';
  last_response_time_ms: number | null;
  last_status_code: number | null;
  last_final_url: string | null;
  last_tls_days_remaining: number | null;
  last_failed_assertion_count: number;
  consecutive_failures: number;
}

export interface HttpCheckRecord {
  id: number;
  target_name: string;
  timestamp: number;
  status: HealthStatus;
  response_time_ms: number | null;
  status_code: number | null;
  final_url: string | null;
  redirect_count: number | null;
  content_type: string | null;
  content_length: number | null;
  tls_subject_cn: string | null;
  tls_issuer_cn: string | null;
  tls_valid_from: string | null;
  tls_valid_to: string | null;
  tls_days_remaining: number | null;
  error_message: string | null;
  assertions: string | null;
}

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
