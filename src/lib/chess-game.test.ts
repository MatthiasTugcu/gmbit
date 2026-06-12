import { describe, expect, it } from "vitest";
import { DEFAULT_POSITION } from "chess.js";
import { gameFromAnnotated, tryMove, uciLineToSan } from "./chess-game";
import type { Move } from "@/types/analysis";

describe("tryMove", () => {
  it("returns the new position for a legal move", () => {
    const r = tryMove(DEFAULT_POSITION, "e2", "e4");
    expect(r).not.toBeNull();
    expect(r!.san).toBe("e4");
  });

  it("returns null for an illegal move instead of throwing", () => {
    expect(tryMove(DEFAULT_POSITION, "e2", "e5")).toBeNull();
  });

  it("returns null for a drop on a square with no piece", () => {
    expect(tryMove(DEFAULT_POSITION, "e4", "e5")).toBeNull();
  });
});

describe("uciLineToSan", () => {
  it("translates a legal line", () => {
    expect(uciLineToSan(DEFAULT_POSITION, ["e2e4", "e7e5"])).toEqual(["e4", "e5"]);
  });

  it("stops at the first illegal move instead of throwing", () => {
    expect(uciLineToSan(DEFAULT_POSITION, ["e2e4", "e7e4"])).toEqual(["e4"]);
  });
});

describe("gameFromAnnotated", () => {
  it("reports the offending ply for an illegal annotated move", () => {
    const bad: Move[] = [
      { n: 1, c: "w", san: "e5??", from: "e2", to: "e5", cls: "good" },
    ];
    expect(() => gameFromAnnotated(bad)).toThrow(/ply 1/);
  });
});
