/**
 * Pure classification + accuracy math. All Score values are WHITE-POSITIVE;
 * the `mover` argument re-orients them. No engine, no React, no I/O.
 */
import type { Color, MoveClass } from "@/types/analysis";

export interface Score {
  cp?: number;
  mate?: number;
}

function logisticWinrate(s: Score, k: number): number {
  if (s.mate !== undefined) return s.mate > 0 ? 100 : 0;
  if (s.cp === undefined) return 50;
  const clamped = Math.max(-1500, Math.min(1500, s.cp));
  return 50 + 50 * (2 / (1 + Math.exp(-k * clamped)) - 1);
}

/** Lichess logistic cp -> win% (0..100) for White; mate collapses to 0/100. */
export function whiteWinrate(s: Score): number {
  return logisticWinrate(s, 0.00368208);
}

/**
 * Steeper cp -> win% used ONLY for accuracy. Lichess's k (0.00368) reads
 * +100cp as just 59%, so small errors barely dent accuracy and game scores
 * come out well above chess.com's. Chess.com's win model (like Stockfish's
 * own WDL calibration) is steeper, making the same errors cost more win%.
 * k, the harmonic floor and ACCURACY_HOPELESS were calibrated together
 * against chess.com-reported accuracies: first on 20 fixture games
 * (scripts/calibrate-batch.ts), then re-fit on 410 stratified GM-dataset
 * games and validated out-of-sample on 80 current-model games via
 * scripts/calibrate-gm.ts (pooled MAE 5.04 vs 5.56 for the previous values).
 * Classification keeps the lichess curve its thresholds were tuned on.
 */
const ACCURACY_WIN_K = 0.005;

/**
 * Mover win% below which a position counts as lost for accuracy: moves with
 * win% under this both before and after are excluded like book moves, so a
 * player's accuracy reflects the phase where the game was still contested.
 * Without it, near-zero-loss shuffling in a lost position banks
 * perfect-accuracy moves chess.com doesn't credit (and being slowly ground
 * down tanks a score chess.com doesn't tank). The winning side keeps full
 * credit for converting. 15 ≈ -350cp on the accuracy curve; the value is
 * calibrated, see ACCURACY_WIN_K.
 */
export const ACCURACY_HOPELESS = 15;

/**
 * Mirror of ACCURACY_HOPELESS for the winning side. A move made from an already
 * decided win (mover win% ≥ ACCURACY_WON) that keeps the mover winning
 * (win% ≥ ACCURACY_WON_KEEP afterwards) is excluded from accuracy. In long,
 * tablebase-less endgames the deep search eval swings between, say, +15 and
 * +1.5 while the win is shuffled home; without this, each swing is scored as a
 * huge win% loss and tanks the score on moves that never gave the win away.
 * A move that actually drops below "still winning" stays counted (a real
 * fumble), so conversion is still required.
 */
export const ACCURACY_WON = 85;
export const ACCURACY_WON_KEEP = 50;

/** Whether a move should be excluded from accuracy because the game was already decided. */
export function decidedForAccuracy(winBefore: number, winAfter: number): boolean {
  const lost = winBefore < ACCURACY_HOPELESS && winAfter < ACCURACY_HOPELESS;
  const keptWin = winBefore >= ACCURACY_WON && winAfter >= ACCURACY_WON_KEEP;
  return lost || keptWin;
}

export function accWhiteWinrate(s: Score): number {
  return logisticWinrate(s, ACCURACY_WIN_K);
}

export function moverWinrate(mover: Color, s: Score): number {
  const w = whiteWinrate(s);
  return mover === "w" ? w : 100 - w;
}

export function accMoverWinrate(mover: Color, s: Score): number {
  const w = accWhiteWinrate(s);
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

export interface MoveAccEntry {
  color: Color;
  /** Per-move accuracy 0..100 (from moveAccuracy). */
  acc: number;
  /** Excluded from accuracy: book moves and dead-lost shuffling. */
  excluded: boolean;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/**
 * Harmonic floor: per-move accuracies are floored inside the harmonic mean.
 * On the steeper accuracy curve a single huge blunder scores ~0, and an
 * unfloored 1/a term would collapse the harmonic mean to ~n·floor on its
 * own — one move halving the game score, far below how chess.com reads the
 * same game. Calibrated, see ACCURACY_WIN_K.
 */
const ACCURACY_FLOOR = 25;

/**
 * Game accuracy: floored harmonic mean of per-move accuracies, per color,
 * excluded moves (book, lost-position shuffling) skipped.
 *
 * Earlier versions blended in lichess's win%-volatility-weighted mean;
 * calibration against chess.com-reported accuracies preferred dropping the
 * weighted component entirely (every parameter set in the optimum's
 * neighbourhood had its blend weight at ~0), so it's gone.
 */
export function gameAccuracy(moves: MoveAccEntry[]): { white: number; black: number } {
  const perColor = (color: Color): number => {
    const accs = moves.filter((m) => m.color === color && !m.excluded).map((m) => m.acc);
    if (accs.length === 0) return 0;
    const harmonic =
      accs.length / accs.reduce((sum, a) => sum + 1 / Math.max(a, ACCURACY_FLOOR), 0);
    return round1(harmonic);
  };

  return { white: perColor("w"), black: perColor("b") };
}

export function classifyMove(a: ClassifyArgs): MoveClass {
  if (a.isBook) return "book";
  if (a.before.lines.length === 0) return "good"; // degenerate: no engine data

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
