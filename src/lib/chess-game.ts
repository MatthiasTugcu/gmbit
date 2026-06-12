import { Chess, DEFAULT_POSITION } from "chess.js";
import type { Move, Players } from "@/types/analysis";

/** chess.js v1 throws on illegal moves; normalise that back to null. */
function moveOrNull(
  chess: Chess,
  move: { from: string; to: string; promotion?: string },
): ReturnType<Chess["move"]> | null {
  try {
    return chess.move(move);
  } catch {
    return null;
  }
}

export interface AnalysisGame {
  moves: Move[];
  fens: string[]; // length moves.length + 1; fens[0] = starting fen
  startingFen: string;
  headers: Record<string, string>;
}

/**
 * Walk a list of annotated moves through chess.js to derive FENs per ply,
 * verifying each move is legal. Used for the bundled demo game.
 */
export function gameFromAnnotated(
  moves: Move[],
  startingFen: string = DEFAULT_POSITION,
): AnalysisGame {
  const chess = new Chess(startingFen);
  const fens: string[] = [chess.fen()];
  for (const m of moves) {
    const result = moveOrNull(chess, { from: m.from, to: m.to, promotion: "q" });
    if (!result) {
      throw new Error(`Illegal move at ply ${fens.length}: ${m.san}`);
    }
    fens.push(chess.fen());
  }
  return { moves, fens, startingFen, headers: {} };
}

/**
 * Parse a PGN string and produce an AnalysisGame. Move metadata (cls, cp, note)
 * is left blank — engine analysis will fill it in.
 */
export function parsePgn(pgn: string): AnalysisGame {
  const chess = new Chess();
  chess.loadPgn(pgn);
  const history = chess.history({ verbose: true });
  const headers = chess.getHeaders() as Record<string, string>;

  const startingFen = headers.FEN ?? DEFAULT_POSITION;
  const replay = new Chess(startingFen);
  const fens: string[] = [replay.fen()];
  const moves: Move[] = [];

  history.forEach((h, i) => {
    const ply = i + 1;
    const moveNumber = Math.ceil(ply / 2);
    const color = h.color === "w" ? "w" : "b";
    const isCheck = h.san.endsWith("+");
    const isMate = h.san.endsWith("#");
    moves.push({
      n: moveNumber,
      c: color,
      san: h.san,
      from: h.from,
      to: h.to,
      promo: h.promotion,
      cls: "good",
      cap: h.isCapture(),
      check: isCheck || isMate,
      mateMove: isMate,
    });
    replay.move({ from: h.from, to: h.to, promotion: h.promotion });
    fens.push(replay.fen());
  });

  return { moves, fens, startingFen, headers };
}

/**
 * Try to make a move from a UCI source/target on a given FEN.
 * Returns the resulting FEN + SAN, or null if the move is illegal.
 */
export function tryMove(
  fen: string,
  from: string,
  to: string,
  promotion: string = "q",
): { fen: string; san: string; from: string; to: string } | null {
  const chess = new Chess(fen);
  const m = moveOrNull(chess, { from, to, promotion });
  if (!m) return null;
  return { fen: chess.fen(), san: m.san, from: m.from, to: m.to };
}

/**
 * Build a Players object from PGN headers, with sensible fallbacks.
 */
export function playersFromHeaders(headers: Record<string, string>): Players {
  const parseRating = (v: string | undefined): number | null => {
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  return {
    white: {
      name: headers.White || "White",
      rating: parseRating(headers.WhiteElo),
      side: "White",
      accuracy: 0,
    },
    black: {
      name: headers.Black || "Black",
      rating: parseRating(headers.BlackElo),
      side: "Black",
      accuracy: 0,
    },
    event: headers.Event || "Imported game",
    result: headers.Result || "*",
    opening: headers.Opening || headers.ECO || "—",
  };
}

/**
 * Convert a UCI move string (e.g. "e2e4", "e7e8q") to {from, to, promotion}.
 */
export function parseUci(uci: string): { from: string; to: string; promotion?: string } {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.length > 4 ? uci[4] : undefined,
  };
}

/**
 * Translate a list of UCI moves into SAN strings, applied against a starting FEN.
 * Returns whatever it can validate, stopping on the first illegal move.
 */
export function uciLineToSan(fen: string, uciMoves: string[]): string[] {
  const chess = new Chess(fen);
  const sans: string[] = [];
  for (const u of uciMoves) {
    const m = moveOrNull(chess, parseUci(u));
    if (!m) break;
    sans.push(m.san);
  }
  return sans;
}
