import { describe, expect, it } from 'vitest';
import { mapPool } from '../eval/lib/pool';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('mapPool', () => {
  it('keeps the input order whatever the completion order', async () => {
    const r = await mapPool([30, 5, 20, 1], 4, async (ms, i) => { await sleep(ms); return i; });
    expect(r).toEqual([0, 1, 2, 3]);
  });
  it('never exceeds the concurrency limit, and actually uses it', async () => {
    let inFlight = 0;
    let peak = 0;
    await mapPool(Array.from({ length: 12 }, (_, i) => i), 4, async () => {
      peak = Math.max(peak, ++inFlight);
      await sleep(5);
      inFlight--;
    });
    expect(peak).toBe(4);
  });
  it('limit 1 is strictly sequential', async () => {
    const order: string[] = [];
    await mapPool(['a', 'b', 'c'], 1, async (x) => { order.push(`start ${x}`); await sleep(3); order.push(`end ${x}`); });
    expect(order).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
  });
  it('reports progress, handles empty input and rejects on the first error', async () => {
    const seen: number[] = [];
    await mapPool([1, 2, 3], 2, async (x) => x, (d) => seen.push(d));
    expect(seen).toEqual([1, 2, 3]);
    expect(await mapPool([], 4, async (x) => x)).toEqual([]);
    await expect(mapPool([1, 2], 2, async (x) => { if (x === 2) throw new Error('nope'); return x; })).rejects.toThrow('nope');
  });
});
