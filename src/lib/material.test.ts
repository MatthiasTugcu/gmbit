import { describe, expect, it } from "vitest";
import { computeMaterial } from "./material";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("computeMaterial", () => {
  it("reports no captures and even material at the start", () => {
    const m = computeMaterial(START);
    expect(m.capturedByWhite).toEqual([]);
    expect(m.capturedByBlack).toEqual([]);
    expect(m.advantage).toBe(0);
  });

  it("counts captured pieces and the point advantage", () => {
    // White is missing a knight; Black is missing a rook and two pawns.
    const fen = "1nbqkbnr/1ppppp1p/8/8/8/8/PPPPPPPP/R1BQKBNR w - - 0 1";
    const m = computeMaterial(fen);
    expect(m.capturedByBlack).toEqual(["n"]); // White's missing knight, taken by Black
    expect(m.capturedByWhite).toEqual(["p", "p", "r"]); // Black's missing pieces, cheapest first
    // White points 39-3=36, Black points 39-(5+2)=32 -> +4 for White.
    expect(m.advantage).toBe(4);
  });

  it("counts promoted material in the advantage", () => {
    // White has two queens (a promotion), full otherwise; Black full.
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNQ w - - 0 1";
    expect(computeMaterial(fen).advantage).toBe(9 - 5); // extra queen for a rook
  });
});
