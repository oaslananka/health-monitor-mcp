import { getDb } from './db.js';
import { getWebhookEncryptionKey, getRetentionDays } from './config.js';
import { encryptSecret, decryptSecret } from './crypto.js';
import type {
  RegisteredWebhookTarget,
  RegisterWebhookInput,
  ListWebhooksInput,
  WebhookDeliveryRecord,
  WebhookDeliveryResult
} from './types.js';

type TargetRow = Omit<RegisteredWebhookTarget, 'events' | 'tags'> & {
  events: string;
  tags: string;
  secret_encrypted: string | null;
};

function parseArray<T>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function mapTarget(row: TargetRow | undefined): RegisteredWebhookTarget | null {
  if (!row) return null;

  let secret: string | null = null;
  if (row.secret_encrypted) {
    const masterKey = getWebhookEncryptionKey();
    if (masterKey) {
      secret = decryptSecret(row.secret_encrypted, masterKey);
    } else {
      secret = '[encrypted]';
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { secret_encrypted: _secretEncrypted, ...rest } = row;
  return {
    ...rest,
    events: parseArray<'down' | 'up' | 'alert'>(row.events),
    tags: parseArray<string>(row.tags),
    secret
  };
}

function listableStatus(
  status: RegisteredWebhookTarget['last_test_status']
): 'up' | 'down' | 'unknown' {
  if (status === 'delivered') return 'up';
  if (status === 'failed') return 'down';
  return 'unknown';
}

export function registerWebhook(input: RegisterWebhookInput): { registered: true; name: string } {
  const masterKey = getWebhookEncryptionKey();
  if (input.secret && !masterKey) {
    throw new Error(
      'Webhook secret provided but HEALTH_MONITOR_WEBHOOK_ENCRYPTION_KEY is not configured'
    );
  }

  const now = Date.now();
  const secretEncrypted = input.secret && masterKey ? encryptSecret(input.secret, masterKey) : null;

  getDb()
    .prepare(
      `
        INSERT INTO webhook_targets (
          name, url, secret_encrypted, events, tags, check_interval_minutes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET
          url = excluded.url,
          secret_encrypted = excluded.secret_encrypted,
          events = excluded.events,
          tags = excluded.tags,
          check_interval_minutes = excluded.check_interval_minutes
      `
    )
    .run(
      input.name,
      input.url,
      secretEncrypted,
      JSON.stringify(input.events),
      JSON.stringify(input.tags),
      input.check_interval_minutes,
      now
    );

  return { registered: true, name: input.name };
}

export function unregisterWebhook(name: string): { unregistered: true; name: string } {
  getDb().prepare('DELETE FROM webhook_targets WHERE name = ?').run(name);
  return { unregistered: true, name };
}

export function getWebhookTarget(name: string): RegisteredWebhookTarget | null {
  const row = getDb().prepare('SELECT * FROM webhook_targets WHERE name = ?').get(name) as
    | TargetRow
    | undefined;
  return mapTarget(row);
}

export function listWebhooks(options: ListWebhooksInput = {}): RegisteredWebhookTarget[] {
  const rows = getDb()
    .prepare('SELECT * FROM webhook_targets ORDER BY name ASC')
    .all() as TargetRow[];

  return rows
    .map((row) => mapTarget(row))
    .filter((row): row is RegisteredWebhookTarget => row !== null)
    .filter((target) => {
      if (options.tags?.length && !options.tags.some((tag) => target.tags.includes(tag))) {
        return false;
      }
      return !options.status || listableStatus(target.last_test_status) === options.status;
    });
}

export function recordWebhookTest(
  targetName: string,
  result: WebhookDeliveryResult,
  now = Date.now()
): void {
  const db = getDb();

  const save = db.transaction(() => {
    db.prepare(
      `
        INSERT INTO webhook_deliveries (
          target_name, timestamp, status, latency_ms, status_code, error_message
        ) VALUES (?, ?, ?, ?, ?, ?)
      `
    ).run(
      targetName,
      now,
      result.status,
      result.latency_ms,
      result.status_code,
      result.error_message
    );

    db.prepare(
      `
        UPDATE webhook_targets
        SET last_tested = ?,
            last_test_status = ?,
            last_test_latency_ms = ?,
            last_test_error = ?
        WHERE name = ?
      `
    ).run(now, result.status, result.latency_ms, result.error_message, targetName);
  });

  save();
}

export function getLatestWebhookDelivery(targetName: string): WebhookDeliveryRecord | null {
  const row = getDb()
    .prepare(
      `
        SELECT *
        FROM webhook_deliveries
        WHERE target_name = ?
        ORDER BY timestamp DESC, id DESC
        LIMIT 1
      `
    )
    .get(targetName) as WebhookDeliveryRecord | undefined;

  return row ?? null;
}

export function pruneWebhookDeliveries(now = Date.now()): number {
  const retentionDays = getRetentionDays();
  const cutoff = now - retentionDays * 24 * 60 * 60 * 1000;
  return getDb()
    .prepare(
      `
        DELETE FROM webhook_deliveries
        WHERE timestamp < ?
      `
    )
    .run(cutoff).changes;
}
