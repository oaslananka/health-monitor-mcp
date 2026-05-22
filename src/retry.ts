export interface RetryOptions {
  attempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  factor: number;
  jitterRatio: number;
  shouldRetry: (error: unknown) => boolean;
}

const DEFAULT_RETRY: RetryOptions = {
  attempts: 2,
  initialDelayMs: 200,
  maxDelayMs: 1000,
  factor: 2,
  jitterRatio: 0,
  shouldRetry: () => true
};

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const config = { ...DEFAULT_RETRY, ...options };
  let lastError: unknown;
  let delayMs = config.initialDelayMs;

  for (let attempt = 0; attempt < config.attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt >= config.attempts - 1 || !config.shouldRetry(error)) {
        throw error;
      }

      const jitter = delayMs * config.jitterRatio * (Math.random() * 2 - 1);
      await sleep(Math.max(0, Math.round(delayMs + jitter)));
      delayMs = Math.min(delayMs * config.factor, config.maxDelayMs);
    }
  }

  throw lastError;
}
