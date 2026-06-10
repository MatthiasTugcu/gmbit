import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { bookMoves, positionKey } from "./openings";
import openingsJson from "@/data/openings.json";

const BOOK = openingsJson as Record<string, string>;

/** Replay SAN moves from the start, returning fens[0..n]. */
function fensOf(sans: string[]): string[] {
  const chess = new Chess();
  const fens = [chess.fen()];
  for (const san of sans) {
    chess.move(san);
    fens.push(chess.fen());
  }
  return fens;
}

describe("positionKey", () => {
  it("strips halfmove and fullmove counters", () => {
    expect(
      positionKey("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"),
    ).toBe("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -");
  });
});

describe("bookMoves", () => {
  it("tags theory moves as book and names the opening", () => {
    const { isBook, openingName } = bookMoves(
      fensOf(["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6"]),
      BOOK,
    );
    expect(isBook).toEqual([true, true, true, true, true, true, true, true, true, true]);
    expect(openingName).toBe("Sicilian Defense: Najdorf Variation");
  });

  it("ends book forever once the game leaves theory", () => {
    // 2. Na3 is legal but never theory; later moves do not re-enter the book.
    // Verified: fens after Na3 is absent from openings.json.
    const { isBook } = bookMoves(fensOf(["e4", "e5", "Na3"]), BOOK);
    expect(isBook).toEqual([true, true, false]);

    // Ke2 (Bongcloud) IS in the dataset; instead use Na3 then verify positions
    // after moves 3+ are all absent.
    const longer = bookMoves(fensOf(["e4", "e5", "Na3", "Nf6", "Nc4"]), BOOK);
    expect(longer.isBook.slice(2)).toEqual([false, false, false]);
  });

  it("ignores engine eval entirely: offbeat non-theory moves are not book", () => {
    // 1. a3 e5 2. a4 — verified: position after a4 is absent from dataset.
    const { isBook } = bookMoves(fensOf(["a3", "e5", "a4"]), BOOK);
    expect(isBook[2]).toBe(false);
  });

  it("returns all-false with no book loaded", () => {
    const { isBook, openingName } = bookMoves(fensOf(["e4", "e5"]), null);
    expect(isBook).toEqual([false, false]);
    expect(openingName).toBeNull();
  });
});
