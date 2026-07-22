export type ToolErrorCode =
  | 'SERVER_NOT_FOUND'
  | 'NO_SERVERS_REGISTERED'
  | 'GITHUB_ACTIONS_TARGET_NOT_FOUND'
  | 'STDIO_DISABLED'
  | 'STDIO_COMMAND_REJECTED';

export type ToolErrorPayload = {
  ok: false;
  error: {
    code: ToolErrorCode;
    message: string;
    remediation: string;
    retryable: boolean;
  };
};

export function toolError(
  code: ToolErrorCode,
  message: string,
  remediation: string,
  retryable = false
): ToolErrorPayload {
  return {
    ok: false,
    error: {
      code,
      message,
      remediation,
      retryable
    }
  };
}
