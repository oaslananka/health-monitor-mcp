import { createHmac } from 'node:crypto';

import { getWebhookTimeoutMs } from './config.js';
import { fetchWithTimeout, RequestTimeoutError } from './network.js';
import type { RegisteredWebhookTarget, WebhookDeliveryResult } from './types.js';

export interface WebhookTarget {
  url: string;
  secret: string | undefined;
  events: Array<'down' | 'up' | 'alert'>;
}

type FetchLike = typeof globalThis.fetch;

let fetchImpl: FetchLike | null = null;

function getFetchImpl(): FetchLike {
  if (fetchImpl) {
    return fetchImpl;
  }

  if (typeof globalThis.fetch !== 'function') {
    throw new Error('Global fetch is not available in this runtime');
  }

  return globalThis.fetch.bind(globalThis);
}

/**
 * Webhook transport helper for alert delivery.
 */
export async function sendWebhook(target: WebhookTarget, payload: unknown): Promise<void> {
  const body = JSON.stringify(payload) ?? 'null';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (target.secret) {
    headers['X-MCP-Signature-256'] = `sha256=${createHmac('sha256', target.secret)
      .update(body)
      .digest('hex')}`;
  }

  let response: Response;

  try {
    response = await fetchWithTimeout(
      getFetchImpl(),
      target.url,
      {
        method: 'POST',
        headers,
        body
      },
      getWebhookTimeoutMs(),
      'Webhook request timed out'
    );
  } catch (error) {
    if (error instanceof RequestTimeoutError) {
      throw new Error(error.message);
    }

    throw error;
  }

  if (!response.ok) {
    throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
  }
}

/**
 * Send a test webhook and return delivery diagnostics.
 */
export async function testWebhook(target: RegisteredWebhookTarget): Promise<WebhookDeliveryResult> {
  const start = Date.now();
  const testPayload = {
    test: true,
    timestamp: new Date().toISOString(),
    target: target.name
  };

  try {
    await sendWebhook(
      {
        url: target.url,
        secret: target.secret ?? undefined,
        events: target.events
      },
      testPayload
    );

    return {
      status: 'delivered',
      latency_ms: Date.now() - start,
      status_code: 200,
      error_message: null
    };
  } catch (error) {
    return {
      status: 'failed',
      latency_ms: Date.now() - start,
      status_code: null,
      error_message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export function setWebhookFetchForTests(nextFetch: FetchLike): void {
  fetchImpl = nextFetch;
}

export function resetWebhookFetchForTests(): void {
  fetchImpl = null;
}
