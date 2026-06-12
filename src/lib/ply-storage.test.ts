import { describe, expect, it } from "vitest";
import { loadPly, savePly } from "./ply-storage";
import { gameFromAnnotated } from "./chess-game";
import type { Move } from "@/types/analysis";

const mv = (n: number, c: "w" | "b", san: string, from: string, to: string): Move => ({
  n,
  c,
  san,
  from,
  to,
  cls: "good",
});

const gameA = gameFromAnnotated([mv(1, "w", "e4", "e2", "e4"), mv(1, "b", "e5", "e7", "e5")]);
const gameB = gameFromAnnotated([mv(1, "w", "d4", "d2", "d4")]);

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  };
}

describe("ply storage", () => {
  it("restores the ply for the same game", () => {
    const s = memoryStorage();
    savePly(s, gameA, 2);
    expect(loadPly(s, gameA)).toBe(2);
  });

  it("ignores a ply stored for a different game", () => {
    const s = memoryStorage();
    savePly(s, gameA, 2);
    expect(loadPly(s, gameB)).toBeNull();
  });

  it("ignores malformed stored values", () => {
    const s = memoryStorage();
    s.setItem("gmbit.ply", "37");
    expect(loadPly(s, gameA)).toBeNull();
  });

  it("clamps a stored ply beyond the game length", () => {
    const s = memoryStorage();
    savePly(s, gameA, 99);
    expect(loadPly(s, gameA)).toBe(2);
  });
});
