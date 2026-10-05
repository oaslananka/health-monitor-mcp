process.env.HEALTH_MONITOR_DB = ':memory:';

import { createHmac } from 'node:crypto';

import { jest } from '@jest/globals';

import { getDb, resetDbForTests } from '../../src/db.js';
import { runMigrations } from '../../src/migrations.js';
import {
  getWebhookTarget,
  listWebhooks,
  recordWebhookTest,
  registerWebhook,
  unregisterWebhook
} from '../../src/webhook-registry.js';
import {
  resetWebhookFetchForTests,
  sendWebhook,
  setWebhookFetchForTests,
  testWebhook
} from '../../src/webhooks.js';

describe('webhooks', () => {
  beforeEach(() => {
    resetWebhookFetchForTests();
    resetDbForTests();
    delete process.env.HEALTH_MONITOR_WEBHOOK_TIMEOUT_MS;
    delete process.env.HEALTH_MONITOR_WEBHOOK_ENCRYPTION_KEY;
  });

  afterEach(() => {
    resetWebhookFetchForTests();
    resetDbForTests();
    delete process.env.HEALTH_MONITOR_WEBHOOK_TIMEOUT_MS;
    delete process.env.HEALTH_MONITOR_WEBHOOK_ENCRYPTION_KEY;
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
        secret: undefined,
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
          secret: undefined,
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
        secret: undefined,
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
          secret: undefined,
          events: ['alert']
        },
        { status: 'down' }
      )
    ).rejects.toThrow('Webhook request timed out');
  });
});

describe('webhook registry', () => {
  beforeEach(() => {
    resetDbForTests();
    delete process.env.HEALTH_MONITOR_WEBHOOK_ENCRYPTION_KEY;
    runMigrations(getDb());
  });

  afterEach(() => {
    resetDbForTests();
    delete process.env.HEALTH_MONITOR_WEBHOOK_ENCRYPTION_KEY;
  });

  it('registers a webhook target without a secret when no encryption key is configured', () => {
    const result = registerWebhook({
      name: 'alert-webhook',
      url: 'https://hooks.example/alert',
      events: ['down', 'alert'],
      tags: ['ops'],
      check_interval_minutes: 5
    });

    expect(result).toEqual({ registered: true, name: 'alert-webhook' });

    const target = getWebhookTarget('alert-webhook');
    expect(target).toEqual(
      expect.objectContaining({
        name: 'alert-webhook',
        url: 'https://hooks.example/alert',
        secret: null,
        events: ['down', 'alert'],
        tags: ['ops'],
        check_interval_minutes: 5,
        last_tested: null,
        last_test_status: null,
        last_test_latency_ms: null,
        last_test_error: null
      })
    );
  });

  it('rejects secret registration when encryption key is not configured', () => {
    expect(() =>
      registerWebhook({
        name: 'alert-webhook',
        url: 'https://hooks.example/alert',
        secret: 'my-secret',
        events: ['down'],
        tags: [],
        check_interval_minutes: 5
      })
    ).toThrow('HEALTH_MONITOR_WEBHOOK_ENCRYPTION_KEY is not configured');
  });

  it('encrypts and stores secret when encryption key is configured', () => {
    process.env.HEALTH_MONITOR_WEBHOOK_ENCRYPTION_KEY = 'a'.repeat(32);

    registerWebhook({
      name: 'secure-webhook',
      url: 'https://hooks.example/secure',
      secret: 'my-super-secret',
      events: ['down', 'up', 'alert'],
      tags: ['production'],
      check_interval_minutes: 10
    });

    const target = getWebhookTarget('secure-webhook');
    expect(target).toEqual(
      expect.objectContaining({
        name: 'secure-webhook',
        url: 'https://hooks.example/secure',
        secret: 'my-super-secret',
        events: ['down', 'up', 'alert'],
        tags: ['production'],
        check_interval_minutes: 10
      })
    );

    const db = getDb();
    const row = db
      .prepare('SELECT secret_encrypted FROM webhook_targets WHERE name = ?')
      .get('secure-webhook') as {
      secret_encrypted: string;
    };
    expect(row.secret_encrypted).toBeDefined();
    expect(row.secret_encrypted).not.toBe('my-super-secret');
    expect(row.secret_encrypted.length).toBeGreaterThan(0);
  });

  it('redacts secret in listings when encryption key is configured', () => {
    process.env.HEALTH_MONITOR_WEBHOOK_ENCRYPTION_KEY = 'a'.repeat(32);

    registerWebhook({
      name: 'webhook-1',
      url: 'https://hooks.example/1',
      secret: 'secret-1',
      events: ['down'],
      tags: [],
      check_interval_minutes: 5
    });
    registerWebhook({
      name: 'webhook-2',
      url: 'https://hooks.example/2',
      events: ['alert'],
      tags: [],
      check_interval_minutes: 5
    });

    const targets = listWebhooks({});
    const withSecret = targets.find((t) => t.name === 'webhook-1');
    const withoutSecret = targets.find((t) => t.name === 'webhook-2');

    expect(withSecret?.secret).toBe('secret-1');
    expect(withoutSecret?.secret).toBeNull();
  });

  it('shows encrypted placeholder when encryption key is not configured but secret was stored', () => {
    process.env.HEALTH_MONITOR_WEBHOOK_ENCRYPTION_KEY = 'a'.repeat(32);
    registerWebhook({
      name: 'legacy-webhook',
      url: 'https://hooks.example/legacy',
      secret: 'old-secret',
      events: ['down'],
      tags: [],
      check_interval_minutes: 5
    });

    // Simulate restart without encryption key by clearing env var
    delete process.env.HEALTH_MONITOR_WEBHOOK_ENCRYPTION_KEY;

    const target = getWebhookTarget('legacy-webhook');
    expect(target?.secret).toBe('[encrypted]');
  });

  it('lists webhook targets with tag and status filters', () => {
    registerWebhook({
      name: 'webhook-prod',
      url: 'https://hooks.example/prod',
      events: ['down'],
      tags: ['production'],
      check_interval_minutes: 5
    });
    registerWebhook({
      name: 'webhook-dev',
      url: 'https://hooks.example/dev',
      events: ['alert'],
      tags: ['development'],
      check_interval_minutes: 5
    });

    const prodTargets = listWebhooks({ tags: ['production'] });
    const devTargets = listWebhooks({ tags: ['development'] });
    const allTargets = listWebhooks({});

    expect(prodTargets).toHaveLength(1);
    expect(prodTargets[0]!.name).toBe('webhook-prod');
    expect(devTargets).toHaveLength(1);
    expect(devTargets[0]!.name).toBe('webhook-dev');
    expect(allTargets).toHaveLength(2);
  });

  it('unregisters a webhook target and cascades delivery history', () => {
    registerWebhook({
      name: 'webhook-to-delete',
      url: 'https://hooks.example/delete',
      events: ['down'],
      tags: [],
      check_interval_minutes: 5
    });

    recordWebhookTest('webhook-to-delete', {
      status: 'delivered',
      latency_ms: 100,
      status_code: 200,
      error_message: null
    });

    let target = getWebhookTarget('webhook-to-delete');
    expect(target).not.toBeNull();

    const beforeDelete = getDb()
      .prepare('SELECT COUNT(*) AS count FROM webhook_deliveries')
      .get() as {
      count: number;
    };
    expect(beforeDelete.count).toBe(1);

    unregisterWebhook('webhook-to-delete');

    target = getWebhookTarget('webhook-to-delete');
    expect(target).toBeNull();

    const afterDelete = getDb()
      .prepare('SELECT COUNT(*) AS count FROM webhook_deliveries')
      .get() as {
      count: number;
    };
    expect(afterDelete.count).toBe(0);
  });

  it('updates existing webhook target on conflict', () => {
    registerWebhook({
      name: 'update-webhook',
      url: 'https://hooks.example/original',
      events: ['down'],
      tags: ['old'],
      check_interval_minutes: 5
    });

    registerWebhook({
      name: 'update-webhook',
      url: 'https://hooks.example/updated',
      events: ['down', 'up', 'alert'],
      tags: ['new'],
      check_interval_minutes: 15
    });

    const target = getWebhookTarget('update-webhook');
    expect(target).toEqual(
      expect.objectContaining({
        url: 'https://hooks.example/updated',
        events: ['down', 'up', 'alert'],
        tags: ['new'],
        check_interval_minutes: 15
      })
    );
  });
});

describe('webhook test delivery', () => {
  beforeEach(() => {
    resetWebhookFetchForTests();
    resetDbForTests();
    delete process.env.HEALTH_MONITOR_WEBHOOK_TIMEOUT_MS;
    process.env.HEALTH_MONITOR_WEBHOOK_ENCRYPTION_KEY = 'a'.repeat(32);
    runMigrations(getDb());
  });

  afterEach(() => {
    resetWebhookFetchForTests();
    resetDbForTests();
    delete process.env.HEALTH_MONITOR_WEBHOOK_TIMEOUT_MS;
    delete process.env.HEALTH_MONITOR_WEBHOOK_ENCRYPTION_KEY;
  });

  it('returns delivery diagnostics for successful test', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK'
    }));
    setWebhookFetchForTests(fetchMock as unknown as typeof fetch);

    registerWebhook({
      name: 'test-webhook',
      url: 'https://hooks.example/test',
      secret: 'test-secret',
      events: ['down'],
      tags: [],
      check_interval_minutes: 5
    });

    const target = getWebhookTarget('test-webhook')!;
    const result = await testWebhook(target);

    expect(result.status).toBe('delivered');
    expect(result.latency_ms).toBeGreaterThanOrEqual(0);
    expect(result.status_code).toBe(200);
    expect(result.error_message).toBeNull();
  });

  it('returns delivery diagnostics for failed test', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error'
    }));
    setWebhookFetchForTests(fetchMock as unknown as typeof fetch);

    registerWebhook({
      name: 'failing-webhook',
      url: 'https://hooks.example/fail',
      events: ['down'],
      tags: [],
      check_interval_minutes: 5
    });

    const target = getWebhookTarget('failing-webhook')!;
    const result = await testWebhook(target);

    expect(result.status).toBe('failed');
    expect(result.latency_ms).toBeGreaterThanOrEqual(0);
    expect(result.status_code).toBe(500);
    expect(result.error_message).toContain('Webhook failed: 500');
  });

  it('records test result and updates target metadata', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 202,
      statusText: 'Accepted'
    }));
    setWebhookFetchForTests(fetchMock as unknown as typeof fetch);

    registerWebhook({
      name: 'record-webhook',
      url: 'https://hooks.example/record',
      events: ['down'],
      tags: [],
      check_interval_minutes: 5
    });

    const target = getWebhookTarget('record-webhook')!;
    const result = await testWebhook(target);
    recordWebhookTest(target.name, result);

    const updatedTarget = getWebhookTarget('record-webhook')!;
    expect(updatedTarget.last_tested).not.toBeNull();
    expect(updatedTarget.last_test_status).toBe(result.status);
    expect(updatedTarget.last_test_latency_ms).toBe(result.latency_ms);

    const delivery = getDb()
      .prepare('SELECT * FROM webhook_deliveries WHERE target_name = ? ORDER BY timestamp DESC')
      .get('record-webhook') as Record<string, unknown>;
    expect(delivery.status).toBe('delivered');
    expect(delivery.latency_ms).toBe(result.latency_ms);
    expect(delivery.status_code).toBe(202);
  });
});

describe('webhook crypto', () => {
  it('encrypts and decrypts secrets correctly', async () => {
    const { encryptSecret, decryptSecret } = await import('../../src/crypto.js');
    const masterKey = 'a'.repeat(32);
    const plaintext = 'my-webhook-secret';

    const encrypted = encryptSecret(plaintext, masterKey);
    expect(encrypted).not.toBe(plaintext);

    const decrypted = decryptSecret(encrypted, masterKey);
    expect(decrypted).toBe(plaintext);
  });

  it('produces different ciphertext for same plaintext', async () => {
    const { encryptSecret } = await import('../../src/crypto.js');
    const masterKey = 'a'.repeat(32);
    const plaintext = 'my-webhook-secret';

    const encrypted1 = encryptSecret(plaintext, masterKey);
    const encrypted2 = encryptSecret(plaintext, masterKey);

    expect(encrypted1).not.toBe(encrypted2);
  });

  it('fails to decrypt with wrong key', async () => {
    const { encryptSecret, decryptSecret } = await import('../../src/crypto.js');
    const masterKey1 = 'a'.repeat(32);
    const masterKey2 = 'b'.repeat(32);
    const plaintext = 'my-webhook-secret';

    const encrypted = encryptSecret(plaintext, masterKey1);
    expect(() => decryptSecret(encrypted, masterKey2)).toThrow();
  });
});
