import { withRetry } from '../../src/retry.js';

describe('retry', () => {
  it('retries until the function succeeds', async () => {
    let attempts = 0;

    const result = await withRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new Error('try again');
        }

        return 'ok';
      },
      {
        attempts: 3,
        initialDelayMs: 1,
        maxDelayMs: 2,
        factor: 2
      }
    );

    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('does not retry when shouldRetry returns false', async () => {
    let attempts = 0;

    await expect(
      withRetry(
        async () => {
          attempts += 1;
          throw new Error('stop');
        },
        {
          attempts: 3,
          initialDelayMs: 1,
          maxDelayMs: 2,
          factor: 2,
          shouldRetry: () => false
        }
      )
    ).rejects.toThrow('stop');

    expect(attempts).toBe(1);
  });
});
