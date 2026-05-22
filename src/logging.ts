type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const REDACTED_KEYS = new Set(['args', 'authorization', 'env', 'password', 'secret', 'token']);

function sanitizeValue(key: string, value: unknown): unknown {
  if (REDACTED_KEYS.has(key.toLowerCase())) {
    return '[redacted]';
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(key, item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        sanitizeValue(childKey, childValue)
      ])
    );
  }

  return value;
}

export function log(level: LogLevel, message: string, context: Record<string, unknown> = {}): void {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    context: sanitizeValue('context', context)
  };
  const serialized = JSON.stringify(payload);

  switch (level) {
    case 'error':
      console.error(serialized);
      break;
    case 'warn':
      console.warn(serialized);
      break;
    default:
      console.log(serialized);
      break;
  }
}
