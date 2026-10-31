/**
 * Run `fn` over `items` with at most `limit` in flight; results keep the input order.
 * Used to send several requests at once to the batching server (the server merges them into one generate()).
 * limit = 1 reproduces the old sequential behaviour exactly.
 */
export async function mapPool<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>, onDone?: (done: number) => void): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  let done = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
      onDone?.(++done);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length || 1)) }, worker));
  return out;
}
