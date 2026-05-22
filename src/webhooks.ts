import { createHmac } from 'node:crypto';

import { getWebhookTimeoutMs } from './config.js';
import { fetchWithTimeout, RequestTimeoutError } from './network.js';

export interface WebhookTarget {
  url: string;
  secret?: string;
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
 * Webhook transport helper for future alert delivery.
 * Public webhook tools are still planned for v1.1.
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

export function setWebhookFetchForTests(nextFetch: FetchLike): void {
  fetchImpl = nextFetch;
}

export function resetWebhookFetchForTests(): void {
  fetchImpl = null;
}
