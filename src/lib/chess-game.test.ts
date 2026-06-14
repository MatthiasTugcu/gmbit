import { describe, expect, it } from "vitest";
import { DEFAULT_POSITION } from "chess.js";
import { clockToSeconds, gameFromAnnotated, parsePgn, tryMove, uciLineToSan } from "./chess-game";
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

describe("clockToSeconds", () => {
  it("parses H:MM:SS and M:SS, flooring fractions", () => {
    expect(clockToSeconds("0:09:58")).toBe(598);
    expect(clockToSeconds("1:00:00")).toBe(3600);
    expect(clockToSeconds("2:30.5")).toBe(150);
  });

  it("returns NaN for malformed input", () => {
    expect(Number.isNaN(clockToSeconds("oops"))).toBe(true);
  });
});

describe("parsePgn clock extraction", () => {
  it("attaches each ply's [%clk] time, in seconds, to the right move", () => {
    const pgn =
      '[White "a"]\n[Black "b"]\n\n' +
      "1. e4 {[%clk 0:03:00]} e5 {[%clk 0:02:58]} 2. Nf3 {[%clk 0:02:55]} *";
    const game = parsePgn(pgn);
    expect(game.moves.map((m) => m.clock)).toEqual([180, 178, 175]);
  });

  it("leaves clocks undefined when the PGN has none", () => {
    const game = parsePgn('[White "a"]\n[Black "b"]\n\n1. e4 e5 *');
    expect(game.moves.every((m) => m.clock === undefined)).toBe(true);
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
