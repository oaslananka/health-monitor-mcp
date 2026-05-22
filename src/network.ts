export class RequestTimeoutError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RequestTimeoutError';
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export async function fetchWithTimeout(
  fetchImpl: typeof globalThis.fetch,
  input: string | URL | Request,
  init: RequestInit,
  timeoutMs: number,
  timeoutMessage: string
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetchImpl(input, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    if (controller.signal.aborted || isAbortError(error)) {
      throw new RequestTimeoutError(timeoutMessage);
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}
