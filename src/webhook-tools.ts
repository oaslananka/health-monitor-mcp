import { hasWebhookEncryptionKey } from './config.js';
import {
  getWebhookTarget,
  listWebhooks,
  recordWebhookTest,
  registerWebhook,
  unregisterWebhook
} from './webhook-registry.js';
import { testWebhook } from './webhooks.js';
import { toolError } from './tool-errors.js';
import {
  ListWebhooksSchema,
  RegisterWebhookSchema,
  TestWebhookSchema,
  UnregisterWebhookSchema
} from './types.js';
import type {
  ListWebhooksInput,
  RegisterWebhookInput,
  TestWebhookInput,
  UnregisterWebhookInput,
  WebhookDeliveryResult
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

function redactSecret(target: { secret: string | null }): { secret: string | null } {
  if (target.secret && target.secret !== '[encrypted]' && target.secret !== '[decryption-failed]') {
    return { ...target, secret: '[redacted]' };
  }
  return target;
}

function formatDeliveryResult(result: WebhookDeliveryResult): string {
  if (result.status === 'delivered') {
    return `Webhook delivered in ${result.latency_ms}ms (HTTP ${result.status_code})`;
  }
  return `Webhook failed: ${result.error_message ?? 'Unknown error'}`;
}

export function registerWebhookTools(server: ToolRegistrar): void {
  server.registerTool(
    'register_webhook',
    {
      title: 'Register Webhook Target',
      description:
        'Register a webhook target for alert delivery. Secrets are encrypted at rest when HEALTH_MONITOR_WEBHOOK_ENCRYPTION_KEY is configured; otherwise secret registration is rejected.',
      inputSchema: RegisterWebhookSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true
      }
    },
    async (input: RegisterWebhookInput) => {
      if (input.secret && !hasWebhookEncryptionKey()) {
        return formatResponse(
          toolError(
            'WEBHOOK_ENCRYPTION_KEY_REQUIRED',
            'Webhook secret provided but HEALTH_MONITOR_WEBHOOK_ENCRYPTION_KEY is not configured',
            'Set HEALTH_MONITOR_WEBHOOK_ENCRYPTION_KEY to a 32+ character key to enable encrypted secret storage.'
          )
        );
      }

      try {
        const result = await registerWebhook(input);
        return formatResponse({
          ...result,
          message: `${input.name} registered. Run test_webhook to validate delivery.`
        });
      } catch (error) {
        return formatResponse(
          toolError(
            'WEBHOOK_REGISTRATION_FAILED',
            error instanceof Error ? error.message : 'Failed to register webhook',
            'Check the input parameters and ensure the encryption key is set if providing a secret.'
          )
        );
      }
    }
  );

  server.registerTool(
    'test_webhook',
    {
      title: 'Test Webhook Target',
      description:
        'Send a test payload to a registered webhook target and return delivery diagnostics including status, latency, and error details.',
      inputSchema: TestWebhookSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true
      }
    },
    async (input: TestWebhookInput) => {
      const target = await getWebhookTarget(input.name);
      if (!target) {
        return formatResponse(
          toolError(
            'WEBHOOK_NOT_FOUND',
            `Webhook target is not registered: ${input.name}`,
            'Run register_webhook first, then retry the operation.'
          )
        );
      }

      const result = await testWebhook(target);
      recordWebhookTest(target.name, result);

      return formatResponse({
        name: target.name,
        url: target.url,
        ...result,
        tested_at: new Date().toISOString(),
        message: formatDeliveryResult(result)
      });
    }
  );

  server.registerTool(
    'list_webhooks',
    {
      title: 'List Webhook Targets',
      description:
        'List registered webhook targets and their latest test status. Secrets are always redacted in listings.',
      inputSchema: ListWebhooksSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async (input: ListWebhooksInput) => {
      const targets = await listWebhooks(input);
      const redactedTargets = targets.map(redactSecret);
      return formatResponse({ count: redactedTargets.length, targets: redactedTargets });
    }
  );

  server.registerTool(
    'unregister_webhook',
    {
      title: 'Unregister Webhook Target',
      description: 'Remove a webhook target and its stored delivery history.',
      inputSchema: UnregisterWebhookSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: false
      }
    },
    (input: UnregisterWebhookInput) => formatResponse(unregisterWebhook(input.name))
  );
}
