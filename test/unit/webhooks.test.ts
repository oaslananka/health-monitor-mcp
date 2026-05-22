import { createHmac } from 'node:crypto';

import { jest } from '@jest/globals';

import {
  resetWebhookFetchForTests,
  sendWebhook,
  setWebhookFetchForTests
} from '../../src/webhooks.js';

describe('webhooks', () => {
  beforeEach(() => {
    resetWebhookFetchForTests();
    delete process.env.HEALTH_MONITOR_WEBHOOK_TIMEOUT_MS;
  });

  afterEach(() => {
    resetWebhookFetchForTests();
    delete process.env.HEALTH_MONITOR_WEBHOOK_TIMEOUT_MS;
  });

  it('sends a JSON webhook without a signature when no secret is configured', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 202,
      statusText: 'Accepted'
    }));

    setWebhookFetchForTests(fetchMock as unknown as typeof fetch);

    await sendWebhook(
      {
        url: 'https://hooks.example/events',
        events: ['alert']
      },
      { status: 'down', server: 'alpha' }
    );

    expect(fetchMock).toHaveBeenCalledWith('https://hooks.example/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: '{"status":"down","server":"alpha"}',
      signal: expect.any(AbortSignal)
    });
  });

  it('signs the payload with HMAC-SHA256 when a secret is configured', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK'
    }));
    const payload = { message: 'server down', server: 'beta' };
    const body = JSON.stringify(payload);
    const signature = `sha256=${createHmac('sha256', 'super-secret').update(body).digest('hex')}`;

    setWebhookFetchForTests(fetchMock as unknown as typeof fetch);

    await sendWebhook(
      {
        url: 'https://hooks.example/signed',
        secret: 'super-secret',
        events: ['down']
      },
      payload
    );

    expect(fetchMock).toHaveBeenCalledWith('https://hooks.example/signed', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-MCP-Signature-256': signature
      },
      body,
      signal: expect.any(AbortSignal)
    });
  });

  it('throws when the webhook endpoint rejects the request', async () => {
    setWebhookFetchForTests(
      (async () =>
        ({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error'
        }) as Response) as typeof fetch
    );

    await expect(
      sendWebhook(
        {
          url: 'https://hooks.example/fail',
          events: ['alert']
        },
        { status: 'error' }
      )
    ).rejects.toThrow('Webhook failed: 500 Internal Server Error');
  });

  it('passes an AbortSignal to webhook delivery requests', async () => {
    const fetchMock = jest.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.signal).toBeDefined();
      return {
        ok: true,
        status: 202,
        statusText: 'Accepted'
      } as Response;
    });

    setWebhookFetchForTests(fetchMock as typeof fetch);

    await sendWebhook(
      {
        url: 'https://hooks.example/events',
        events: ['alert']
      },
      { status: 'down' }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://hooks.example/events',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('classifies webhook aborts as timeouts', async () => {
    process.env.HEALTH_MONITOR_WEBHOOK_TIMEOUT_MS = '25';
    setWebhookFetchForTests((async (_url: string | URL | Request, init?: RequestInit) => {
      init?.signal?.throwIfAborted();
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      throw error;
    }) as typeof fetch);

    await expect(
      sendWebhook(
        {
          url: 'https://hooks.example/timeout',
          events: ['alert']
        },
        { status: 'down' }
      )
    ).rejects.toThrow('Webhook request timed out');
  });
});
