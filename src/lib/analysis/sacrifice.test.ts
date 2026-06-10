import { describe, expect, it } from "vitest";
import { isSacrifice } from "./sacrifice";

describe("isSacrifice", () => {
  it("detects a queen left en prise to a defended pawn (greek-gift style)", () => {
    // White queen takes the h7 pawn defended by the king.
    const fen = "6k1/7p/8/8/8/3Q4/8/6K1 w - - 0 1";
    expect(isSacrifice(fen, "d3h7")).toBe(true);
  });

  it("does not flag a protected capture of equal value", () => {
    // Rook takes rook, recapture possible: an exchange, not a sacrifice.
    const fen = "3r2k1/8/8/8/8/8/3R4/3R2K1 w - - 0 1";
    expect(isSacrifice(fen, "d2d8")).toBe(false);
  });

  it("does not flag a safe developing move", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    expect(isSacrifice(fen, "g1f3")).toBe(false);
  });

  it("does not flag winning an undefended piece", () => {
    // Queen takes a free rook.
    const fen = "3r2k1/8/8/8/8/8/3Q4/6K1 w - - 0 1";
    expect(isSacrifice(fen, "d2d8")).toBe(false);
  });

  it("detects a piece moved to a square where a pawn wins it", () => {
    // Knight hops onto a square attacked by a pawn, no compensation.
    const fen = "6k1/8/2p5/8/3N4/8/8/6K1 w - - 0 1";
    expect(isSacrifice(fen, "d4b5")).toBe(true); // b5 attacked by c6 pawn
  });

  it("never flags pawn moves without capture", () => {
    const fen = "6k1/8/8/3p4/8/8/4P3/6K1 w - - 0 1";
    expect(isSacrifice(fen, "e2e4")).toBe(false); // even though d5 pawn could take
  });
});
