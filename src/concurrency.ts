export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  maxConcurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<Array<PromiseSettledResult<R>>> {
  if (items.length === 0) {
    return [];
  }

  const results = new Array<PromiseSettledResult<R>>(items.length);
  const workerCount = Math.min(items.length, Math.max(1, Math.floor(maxConcurrency)));
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        const item = items[index];

        if (item === undefined) {
          continue;
        }

        try {
          results[index] = {
            status: 'fulfilled',
            value: await worker(item, index)
          };
        } catch (reason) {
          results[index] = {
            status: 'rejected',
            reason
          };
        }
      }
    })
  );

  return results;
}
