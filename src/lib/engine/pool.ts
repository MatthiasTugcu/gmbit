/**
 * Run `fn` over `items` with up to `lanes` concurrent executions. Each lane
 * pulls the next unprocessed item, so lane `i` can own a dedicated resource
 * (e.g. one engine worker per lane). Rejects on the first error.
 */
export async function mapPool<T>(
  items: T[],
  lanes: number,
  fn: (item: T, lane: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  const lane = async (laneIndex: number) => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      await fn(items[i], laneIndex);
    }
  };
  const count = Math.max(1, Math.min(lanes, items.length));
  await Promise.all(Array.from({ length: count }, (_, i) => lane(i)));
}
