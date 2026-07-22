import { assertHttpTargetUrlAllowed } from './http-target-policy.js';
import {
  getHttpTarget,
  listHttpTargets,
  recordHttpCheck,
  registerHttpTarget,
  unregisterHttpTarget
} from './http-target-registry.js';
import { checkHttpTarget } from './http-targets.js';
import type { RuntimePolicy } from './policy.js';
import { toolError } from './tool-errors.js';
import {
  CheckHttpTargetSchema,
  ListHttpTargetsSchema,
  RegisterHttpTargetSchema,
  UnregisterHttpTargetSchema
} from './types.js';
import type {
  CheckHttpTargetInput,
  ListHttpTargetsInput,
  RegisterHttpTargetInput,
  UnregisterHttpTargetInput
} from './types.js';

type ToolResponse = {
  content: Array<{ type: 'text'; text: string }>;
};

type ToolRegistrar = {
  registerTool: (
    name: string,
    config: {
      title?: string;
      description?: string;
      inputSchema?: object;
      annotations?: {
        readOnlyHint?: boolean;
        destructiveHint?: boolean;
        openWorldHint?: boolean;
      };
    },
    handler: unknown
  ) => unknown;
};

function formatResponse(payload: unknown): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }]
  };
}

export function registerHttpTargetTools(server: ToolRegistrar, policy: RuntimePolicy): void {
  server.registerTool(
    'register_http_target',
    {
      title: 'Register HTTP Target',
      description:
        'Register a GET-only HTTP or HTTPS endpoint with status, header, body, JSON, and TLS-expiry assertions. Public networks are allowed by default; private origins require full profile and HEALTH_MONITOR_HTTP_TARGET_ALLOWLIST.',
      inputSchema: RegisterHttpTargetSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true
      }
    },
    async (input: RegisterHttpTargetInput) => {
      try {
        const resolved = await assertHttpTargetUrlAllowed(input.url, policy.profile);
        const result = registerHttpTarget({ ...input, url: resolved.url });
        return formatResponse({
          ...result,
          message: `${input.name} registered. Run check_http_target to validate the endpoint.`
        });
      } catch (error) {
        return formatResponse(
          toolError(
            'HTTP_TARGET_URL_NOT_ALLOWED',
            error instanceof Error ? error.message : 'HTTP target URL is not allowed',
            'Use a public HTTP(S) endpoint. Trusted private origins require the full profile and exact HEALTH_MONITOR_HTTP_TARGET_ALLOWLIST membership.'
          )
        );
      }
    }
  );

  server.registerTool(
    'check_http_target',
    {
      title: 'Check HTTP Target',
      description:
        'Check a registered HTTP target with DNS-pinned SSRF protection, bounded redirects/body reads, response assertions, and TLS-expiry diagnostics.',
      inputSchema: CheckHttpTargetSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true
      }
    },
    async (input: CheckHttpTargetInput) => {
      const target = getHttpTarget(input.name);
      if (!target) {
        return formatResponse(
          toolError(
            'HTTP_TARGET_NOT_FOUND',
            `HTTP target is not registered: ${input.name}`,
            'Run register_http_target first, then retry the operation.'
          )
        );
      }

      const result = await checkHttpTarget(target, input.timeout_ms, { profile: policy.profile });
      recordHttpCheck(target.name, result);
      return formatResponse({
        name: target.name,
        url: target.url,
        ...result,
        checked_at: new Date().toISOString(),
        message:
          result.status === 'up'
            ? `${target.name} is UP - HTTP ${result.response?.status_code ?? 'unknown'} in ${result.response_time_ms}ms`
            : `${target.name} is ${result.status.toUpperCase()} - ${result.error_message ?? 'assertion failure'}`
      });
    }
  );

  server.registerTool(
    'list_http_targets',
    {
      title: 'List HTTP Targets',
      description:
        'List registered HTTP targets and their latest status, response, and TLS summary.',
      inputSchema: ListHttpTargetsSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async (input: ListHttpTargetsInput) => {
      const targets = listHttpTargets(input);
      return formatResponse({ count: targets.length, targets });
    }
  );

  server.registerTool(
    'unregister_http_target',
    {
      title: 'Unregister HTTP Target',
      description: 'Remove an HTTP target and its stored check history.',
      inputSchema: UnregisterHttpTargetSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: false
      }
    },
    async (input: UnregisterHttpTargetInput) => formatResponse(unregisterHttpTarget(input.name))
  );
}
