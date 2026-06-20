export type MoveClass =
  | "brilliant"
  | "great"
  | "best"
  | "excellent"
  | "good"
  | "book"
  | "inaccuracy"
  | "mistake"
  | "miss"
  | "blunder";

export type Color = "w" | "b";
export type Square = string;
export type PieceType = "k" | "q" | "r" | "b" | "n" | "p";

export interface Move {
  n: number;
  c: Color;
  san: string;
  from: Square;
  to: Square;
  /** Promotion piece in UCI form (e.g. "q"), when the move promotes. */
  promo?: string;
  cls: MoveClass;
  cp?: number;
  mate?: number;
  note?: string;
  cap?: boolean;
  check?: boolean;
  mateMove?: boolean;
  castle?: { rookFrom: Square; rookTo: Square };
  /** Clock remaining (seconds) for the mover after this move, from PGN `[%clk]`. */
  clock?: number;
}

export interface Players {
  white: { name: string; rating: number | null; side: "White"; accuracy: number };
  black: { name: string; rating: number | null; side: "Black"; accuracy: number };
  event: string;
  result: string;
  opening: string;
}

/** Engine effort selected on the landing page. */
export type AnalysisMode = "fast" | "deep";
