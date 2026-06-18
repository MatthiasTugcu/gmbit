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
 * cp -> win% steepness. Two values, deliberately decoupled — accuracy and
 * classification are different concerns that used to share one constant:
 *
 *  - ACCURACY_WIN_K drives the accuracy score only. Refit 2026-06-16 against
 *    chess.com-reported accuracies on 240 current-model games spanning
 *    1200–1700 (scripts/refit-accuracy.ts, fixtures/combined-current), jointly
 *    with moveAccuracy's curve and gameAccuracy's power mean. Roughly halved
 *    pooled MAE (~6.3 -> ~3.5), every rating band, and held cross-validated
 *    out-of-distribution (params fit on 1500 still cut the 1200 set 5.78 ->
 *    3.72). Note this is GENTLER than the old shared 0.005 — the per-move
 *    curve (moveAccuracy) now carries the sensitivity instead.
 *  - CLASSIFY_WIN_K drives classifyMove's loss-band thresholds, which land on
 *    chess.com's published EP-loss bands (0.02/0.05/0.10/0.20). Held at the
 *    earlier 0.005 so the accuracy refit leaves move classifications unchanged.
 */
const ACCURACY_WIN_K = 0.00207;
const CLASSIFY_WIN_K = 0.005;

/**
 * Mover win% below which a position counts as lost for accuracy: moves with
 * win% under this both before and after are excluded like book moves, so a
 * player's accuracy reflects the phase where the game was still contested.
 * Without it, near-zero-loss shuffling in a lost position banks
 * perfect-accuracy moves chess.com doesn't credit (and being slowly ground
 * down tanks a score chess.com doesn't tank). The winning side keeps full
 * credit for converting. 15 ≈ -840cp on the (gentler) accuracy curve; the
 * value was held fixed through the 2026-06 refit, see ACCURACY_WIN_K.
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
 * Win% on the classification curve (CLASSIFY_WIN_K), keeping classifyMove's
 * loss-band cutoffs independent of the accuracy refit.
 */
function classifyMoverWinrate(mover: Color, s: Score): number {
  const w = logisticWinrate(s, CLASSIFY_WIN_K);
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

/**
 * Per-move accuracy from win% loss, clamped to [0, 100]. Curve constants refit
 * to chess.com 2026-06-16 (see ACCURACY_WIN_K) — steeper than lichess's
 * original a·e^(-0.0435·loss), so a given win% slip costs more accuracy now
 * that the win% curve feeding `loss` is gentler.
 */
export function moveAccuracy(loss: number): number {
  const a = 104.13 * Math.exp(-0.1329 * Math.max(0, loss)) - 2.01;
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
  /** Move lands on the square the opponent just moved to (a forced recapture).
   * Such moves are "only moves" but never "great". Default false. */
  recapture?: boolean;
}

const GREAT_GAP = 15; // win% the next-best line must trail by (on the calibrated curve)
const GREAT_WIN = 75; // win% that counts as "winning" for the equal->winning swing
const GREAT_MIN = 15; // next-best below this means the game's already decided — not great
const GREAT_MAX = 85; // best above this means we're just converting a win — not great
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
 * Per-move accuracies are floored before being averaged, so a single ~0 move
 * can't drag the game score below how chess.com reads the same game. Refit
 * down from 25 alongside the power-mean exponent (see ACCURACY_WIN_K).
 */
const ACCURACY_FLOOR = 8.7;

/**
 * Power-mean exponent for aggregating per-move accuracies. p = -1 is the
 * harmonic mean we used to ship; the 2026-06 refit moved it to ~0.305 (between
 * geometric and arithmetic) — less bottom-heavy, because the steeper per-move
 * curve already makes bad moves cost more. Calibrated, see ACCURACY_WIN_K.
 */
const ACCURACY_MEAN_P = 0.305;

/**
 * Game accuracy: floored power mean of per-move accuracies, per color, with
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
    const mean =
      accs.reduce((sum, a) => sum + Math.pow(Math.max(a, ACCURACY_FLOOR), ACCURACY_MEAN_P), 0) /
      accs.length;
    return round1(Math.pow(mean, 1 / ACCURACY_MEAN_P));
  };

  return { white: perColor("w"), black: perColor("b") };
}

export function classifyMove(a: ClassifyArgs): MoveClass {
  if (a.isBook) return "book";
  if (a.before.lines.length === 0) return "good"; // degenerate: no engine data

  const best = a.before.lines[0];
  // Win% uses the classification curve (CLASSIFY_WIN_K) so the loss cutoffs
  // below land on chess.com's published EP-loss bands (0.02/0.05/0.10/0.20).
  // This is its own constant, independent of the (gentler) accuracy curve, so
  // the accuracy refit doesn't disturb move classifications.
  const wBefore = classifyMoverWinrate(a.mover, best.score);
  const wAfter = classifyMoverWinrate(a.mover, a.after);
  const loss = Math.max(0, wBefore - wAfter);

  const matchesBest = !!best.uci && best.uci === a.playedUci;
  // Eval comparison uses moverScore, not winrate: winrate saturates at 0/100
  // in decided positions and would call every move "best".
  const asGoodAsBest = moverScore(a.mover, a.after) >= moverScore(a.mover, best.score);

  if (matchesBest || asGoodAsBest) {
    if (a.sacrifice() && wAfter >= 30 && wBefore <= 95) return "brilliant";
    // chess.com V2 "Great": a critical, NON-forced find — the only move that
    // turns a losing line equal (heldEquality) or an equal line winning
    // (securedWin), in a position that's still genuinely contested. Forced
    // recaptures and already-decided positions also have a huge gap to the
    // next-best line, but they are not great however "only" the move is — hence
    // the recapture exclusion and the contested band.
    const second = a.before.lines[1];
    if (second && !a.recapture) {
      const wSecond = classifyMoverWinrate(a.mover, second.score);
      const gap = wBefore - wSecond;
      const contested = wSecond >= GREAT_MIN && wBefore <= GREAT_MAX;
      const heldEquality = wBefore >= 50 && wSecond < 50;
      const securedWin = wBefore >= GREAT_WIN && wSecond < GREAT_WIN;
      if (contested && gap >= GREAT_GAP && (heldEquality || securedWin)) return "great";
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
