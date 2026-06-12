import { describe, expect, it } from "vitest";
import { mapPool } from "./pool";

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe("mapPool", () => {
  it("processes every item exactly once", async () => {
    const seen: number[] = [];
    await mapPool([1, 2, 3, 4, 5], 2, async (item) => {
      await tick();
      seen.push(item);
    });
    expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it("never runs more than `lanes` items concurrently", async () => {
    let active = 0;
    let peak = 0;
    await mapPool([1, 2, 3, 4, 5, 6, 7, 8], 3, async () => {
      active++;
      peak = Math.max(peak, active);
      await tick();
      active--;
    });
    expect(peak).toBe(3);
  });

  it("passes a stable lane index below `lanes`", async () => {
    const lanes = new Set<number>();
    await mapPool([1, 2, 3, 4, 5, 6], 2, async (_item, lane) => {
      lanes.add(lane);
      await tick();
    });
    expect([...lanes].sort()).toEqual([0, 1]);
  });

  it("copes with more lanes than items", async () => {
    const seen: number[] = [];
    await mapPool([1, 2], 8, async (item) => {
      seen.push(item);
    });
    expect(seen.sort()).toEqual([1, 2]);
  });

  it("rejects when a worker throws", async () => {
    await expect(
      mapPool([1, 2, 3], 2, async (item) => {
        if (item === 2) throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});
