export type RuntimeProfile = 'full' | 'remote-safe' | 'chatgpt' | 'claude';

const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'on']);
const REMOTE_SAFE_PROFILES = new Set<RuntimeProfile>(['remote-safe', 'chatgpt', 'claude']);

export function isTruthyEnv(value: string | undefined): boolean {
  return value !== undefined && TRUTHY_VALUES.has(value.trim().toLowerCase());
}

export function getRuntimeProfile(): RuntimeProfile {
  const value = process.env.HEALTH_MONITOR_PROFILE?.trim().toLowerCase();

  if (value === 'remote-safe' || value === 'chatgpt' || value === 'claude') {
    return value;
  }

  return 'full';
}

export function isRemoteSafeProfile(profile: RuntimeProfile): boolean {
  return REMOTE_SAFE_PROFILES.has(profile);
}

export function getBoundedIntegerEnv(
  name: string,
  defaultValue: number,
  minValue: number,
  maxValue: number
): number {
  const raw = process.env[name]?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : defaultValue;

  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }

  return Math.min(maxValue, Math.max(minValue, parsed));
}

export function getHttpTimeoutMs(defaultValue = 10_000): number {
  return getBoundedIntegerEnv('HEALTH_MONITOR_HTTP_TIMEOUT_MS', defaultValue, 1_000, 60_000);
}

export function getWebhookTimeoutMs(): number {
  return getBoundedIntegerEnv('HEALTH_MONITOR_WEBHOOK_TIMEOUT_MS', 5_000, 1_000, 60_000);
}

export function getRetentionDays(): number {
  return getBoundedIntegerEnv('HEALTH_MONITOR_RETENTION_DAYS', 30, 1, 3650);
}

export function getMaxConcurrency(): number {
  return getBoundedIntegerEnv('HEALTH_MONITOR_MAX_CONCURRENCY', 5, 1, 50);
}
