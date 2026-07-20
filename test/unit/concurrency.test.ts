import { mapWithConcurrency } from '../../src/concurrency.js';

describe('mapWithConcurrency', () => {
  it('preserves input ordering while respecting the active worker cap', async () => {
    let active = 0;
    let maxActive = 0;
    const releases = new Map<number, () => void>();

    const resultPromise = mapWithConcurrency([0, 1, 2, 3], 2, async (item) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>((resolve) => {
        releases.set(item, resolve);
      });
      active -= 1;
      return `item-${item}`;
    });

    await new Promise((resolve) => setImmediate(resolve));
    expect(maxActive).toBe(2);
    expect([...releases.keys()].sort()).toEqual([0, 1]);

    releases.get(1)?.();
    await new Promise((resolve) => setImmediate(resolve));
    expect([...releases.keys()].sort()).toEqual([0, 1, 2]);

    releases.get(0)?.();
    await new Promise((resolve) => setImmediate(resolve));
    expect([...releases.keys()].sort()).toEqual([0, 1, 2, 3]);

    releases.get(3)?.();
    releases.get(2)?.();

    await expect(resultPromise).resolves.toEqual([
      { status: 'fulfilled', value: 'item-0' },
      { status: 'fulfilled', value: 'item-1' },
      { status: 'fulfilled', value: 'item-2' },
      { status: 'fulfilled', value: 'item-3' }
    ]);
    expect(maxActive).toBe(2);
  });

  it('continues queued work after a worker rejects', async () => {
    const visited: number[] = [];

    const results = await mapWithConcurrency([1, 2, 3], 1, async (item) => {
      visited.push(item);
      if (item === 2) {
        throw new Error('boom');
      }
      return item * 10;
    });

    expect(visited).toEqual([1, 2, 3]);
    expect(results[0]).toEqual({ status: 'fulfilled', value: 10 });
    expect(results[1]).toEqual(expect.objectContaining({ status: 'rejected' }));
    expect(results[2]).toEqual({ status: 'fulfilled', value: 30 });
  });

  it('returns an empty result for empty input', async () => {
    await expect(mapWithConcurrency([], 5, async () => 'unused')).resolves.toEqual([]);
  });
});
