export class McpError extends Error {
  code: string;
  remediation: string;

  constructor(message: string, code: string, remediation: string) {
    super(message);
    this.name = 'McpError';
    this.code = code;
    this.remediation = remediation;
  }
}

export const ERROR_CODES = {
  SERVER_NOT_REGISTERED: 'SERVER_NOT_REGISTERED',
  PIPELINE_NOT_REGISTERED: 'PIPELINE_NOT_REGISTERED',
  PIPELINE_NOT_RESOLVED: 'PIPELINE_NOT_RESOLVED',
  NO_RECENT_BUILDS: 'NO_RECENT_BUILDS',
  STDIO_DISABLED: 'STDIO_DISABLED'
} as const;

export const REMEDIATIONS = {
  SERVER_NOT_REGISTERED: 'Use the register_server tool to add this server first.',
  PIPELINE_NOT_REGISTERED: 'Use the register_azure_pipeline tool to add this pipeline first.',
  PIPELINE_NOT_RESOLVED: 'Ensure the pipeline ID is correct or allow time for background resolution.',
  NO_RECENT_BUILDS: 'Trigger a build in Azure DevOps to generate telemetry data.',
  STDIO_DISABLED: 'Enable stdio support by setting HEALTH_MONITOR_ENABLE_STDIO=1 in your environment.'
} as const;
