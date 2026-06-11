/**
 * Pure classification + accuracy math. All Score values are WHITE-POSITIVE;
 * the `mover` argument re-orients them. No engine, no React, no I/O.
 */
import type { Color, MoveClass } from "@/types/analysis";

export interface Score {
  cp?: number;
  mate?: number;
}

/** Lichess logistic cp -> win% (0..100) for White; mate collapses to 0/100. */
export function whiteWinrate(s: Score): number {
  if (s.mate !== undefined) return s.mate > 0 ? 100 : 0;
  if (s.cp === undefined) return 50;
  const clamped = Math.max(-1500, Math.min(1500, s.cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clamped)) - 1);
}

export function moverWinrate(mover: Color, s: Score): number {
  const w = whiteWinrate(s);
  return mover === "w" ? w : 100 - w;
}

/**
 * Total order over evals from the mover's perspective, for "is this move at
 * least as good as the engine's best" comparisons. Winrate saturates at 0/100
 * and can't distinguish mate-in-2 from mate-in-9; this can.
 */
export function moverScore(mover: Color, s: Score): number {
  const sign = mover === "w" ? 1 : -1;
  if (s.mate !== undefined) {
    const m = s.mate * sign;
    return m > 0 ? 100000 - m : -100000 - m;
  }
  return (s.cp ?? 0) * sign;
}

/** Published lichess per-move accuracy from win% loss, clamped to [0, 100]. */
export function moveAccuracy(loss: number): number {
  const a = 103.1668 * Math.exp(-0.04354 * Math.max(0, loss)) - 3.1669;
  return Math.max(0, Math.min(100, a));
}

export interface LineEval {
  /** White-positive score of this engine line. */
  score: Score;
  /** First move of the line in UCI (e.g. "e2e4", "e7e8q"). */
  uci?: string;
}

export interface PositionEval {
  /** lines[0] = engine best (also the position eval); lines[1] = second best. */
  lines: LineEval[];
}

export interface ClassifyArgs {
  mover: Color;
  /** Played move as full UCI including promotion piece. */
  playedUci: string;
  /** Search of the position before the move. */
  before: PositionEval;
  /** Eval of the position after the move (from the next position's search). */
  after: Score;
  isBook: boolean;
  /** Lazy: only consulted when the move qualifies as best. */
  sacrifice: () => boolean;
}

const GREAT_GAP = 12; // win% gap to 2nd line that makes a best move "the only move"
const MISS_BEFORE = 75; // win% that counts as a decisive chance
const MISS_AFTER = 60; // dropping below this throws the chance away

export function classifyMove(a: ClassifyArgs): MoveClass {
  if (a.isBook) return "book";

  const best = a.before.lines[0];
  const wBefore = moverWinrate(a.mover, best.score);
  const wAfter = moverWinrate(a.mover, a.after);
  const loss = Math.max(0, wBefore - wAfter);

  const matchesBest = !!best.uci && best.uci === a.playedUci;
  // Eval comparison uses moverScore, not winrate: winrate saturates at 0/100
  // in decided positions and would call every move "best".
  const asGoodAsBest = moverScore(a.mover, a.after) >= moverScore(a.mover, best.score);

  if (matchesBest || asGoodAsBest) {
    if (a.sacrifice() && wAfter >= 30 && wBefore <= 95) return "brilliant";
    const second = a.before.lines[1];
    if (second && wBefore - moverWinrate(a.mover, second.score) >= GREAT_GAP) {
      return "great";
    }
    return "best";
  }

  if (loss < 2) return "excellent";
  if (loss < 5) return "good";

  // Hanging mate-in-1 is always a blunder, even from a winning position.
  const oppMatesIn1 =
    a.after.mate !== undefined && (a.mover === "w" ? a.after.mate === -1 : a.after.mate === 1);
  if (oppMatesIn1) return "blunder";

  // Miss: a decisive chance (mate or near-won position) thrown away.
  const hadMate =
    best.score.mate !== undefined && (a.mover === "w" ? best.score.mate > 0 : best.score.mate < 0);
  if ((hadMate || wBefore >= MISS_BEFORE) && loss >= 10 && wAfter < MISS_AFTER) return "miss";

  // Newly allowing a forced mate (best line had none) upgrades an inaccuracy
  // to a mistake. Applied only at loss >= 5 so best tries in dead-lost
  // positions aren't punished for engine-found mates.
  const allowsMate =
    a.after.mate !== undefined &&
    (a.mover === "w" ? a.after.mate < 0 : a.after.mate > 0) &&
    !(best.score.mate !== undefined && (a.mover === "w" ? best.score.mate < 0 : best.score.mate > 0));

  if (loss < 10) return allowsMate ? "mistake" : "inaccuracy";
  if (loss < 20) return "mistake";
  return "blunder";
}
