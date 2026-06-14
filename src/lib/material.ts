import type { PieceType } from "@/types/analysis";

/** Standard piece values for the material count (king omitted). */
const VALUES: Record<Exclude<PieceType, "k">, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
/** Pieces each side starts with. */
const START: Record<Exclude<PieceType, "k">, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };
/** Display order: cheapest first, matching how captured pieces are shown. */
const ORDER: Exclude<PieceType, "k">[] = ["p", "n", "b", "r", "q"];

export interface Material {
  /** Black pieces White has captured (missing from the board), cheapest first. */
  capturedByWhite: Exclude<PieceType, "k">[];
  /** White pieces Black has captured. */
  capturedByBlack: Exclude<PieceType, "k">[];
  /** Board material difference (White points − Black points); >0 favours White. */
  advantage: number;
}

/**
 * Material from a FEN's piece placement: which pieces each side has captured
 * (derived from what's missing vs the starting set) and the net point advantage.
 * Promotions can make a captured-pawn tally slightly off, but the point
 * advantage is taken straight from the board so it stays correct.
 */
export function computeMaterial(fen: string): Material {
  const placement = fen.split(" ")[0];
  const w: Record<string, number> = { p: 0, n: 0, b: 0, r: 0, q: 0 };
  const b: Record<string, number> = { p: 0, n: 0, b: 0, r: 0, q: 0 };
  for (const ch of placement) {
    const lower = ch.toLowerCase();
    if (lower === "k" || !(lower in VALUES)) continue;
    if (ch === lower) b[lower]++;
    else w[lower]++;
  }

  const capturedByWhite: Exclude<PieceType, "k">[] = [];
  const capturedByBlack: Exclude<PieceType, "k">[] = [];
  let whitePoints = 0;
  let blackPoints = 0;
  for (const t of ORDER) {
    whitePoints += w[t] * VALUES[t];
    blackPoints += b[t] * VALUES[t];
    for (let i = 0; i < Math.max(0, START[t] - b[t]); i++) capturedByWhite.push(t);
    for (let i = 0; i < Math.max(0, START[t] - w[t]); i++) capturedByBlack.push(t);
  }

  return { capturedByWhite, capturedByBlack, advantage: whitePoints - blackPoints };
}
