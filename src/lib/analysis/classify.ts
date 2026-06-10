/**
 * Pure classification + accuracy math. All Score values are WHITE-POSITIVE;
 * the `mover` argument re-orients them. No engine, no React, no I/O.
 */
import type { Color } from "@/types/analysis";

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
