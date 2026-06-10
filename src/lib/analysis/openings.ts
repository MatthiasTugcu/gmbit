/**
 * Opening book backed by the generated lichess/chess-openings position map.
 * A move is "book" while the position after it is known theory; once a game
 * leaves the book it never re-enters, even via transposition.
 */

export type OpeningsMap = Record<string, string>;

/** Safety bound — the dataset rarely exceeds this depth. */
export const MAX_BOOK_PLY = 40;

/** First four FEN fields: board, side to move, castling, en passant. */
export function positionKey(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}

let cached: OpeningsMap | null | undefined;

/** Lazy-load the openings map; resolves null (and logs once) on failure. */
export async function loadOpenings(): Promise<OpeningsMap | null> {
  if (cached !== undefined) return cached;
  try {
    const mod = await import("@/data/openings.json");
    cached = mod.default as OpeningsMap;
  } catch (err) {
    console.warn("openings book failed to load; book detection disabled", err);
    cached = null;
  }
  return cached;
}

export interface BookInfo {
  /** isBook[i] — whether move i (0-based ply) is a book move. */
  isBook: boolean[];
  /** Name attached to the deepest in-book position reached, if any. */
  openingName: string | null;
}

/** fens[0] = starting position, fens[i] = position after move i-1. */
export function bookMoves(fens: string[], book: OpeningsMap | null): BookInfo {
  const isBook: boolean[] = [];
  let openingName: string | null = null;
  let inBook = book !== null;
  for (let i = 1; i < fens.length; i++) {
    if (!inBook || i > MAX_BOOK_PLY) {
      isBook.push(false);
      inBook = false;
      continue;
    }
    const name = book![positionKey(fens[i])];
    if (name !== undefined) {
      isBook.push(true);
      openingName = name;
    } else {
      isBook.push(false);
      inBook = false;
    }
  }
  return { isBook, openingName };
}
