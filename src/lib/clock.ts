import type { Color, Move } from "@/types/analysis";

/** Time-control base (seconds) from a PGN `TimeControl` header, if it has one.
 * Returns undefined for "-", moves-per-period controls (e.g. "40/9000"), or
 * anything without a leading second count. */
export function timeControlBaseSeconds(tc: string | undefined): number | undefined {
  if (!tc || tc === "-" || tc.includes("/")) return undefined;
  const m = tc.match(/^(\d+)/);
  return m ? Number(m[1]) : undefined;
}

/** Clock (seconds) for `color` as of `ply` — the last move that side made by then. */
export function clockAtPly(moves: Move[], ply: number, color: Color): number | undefined {
  for (let i = Math.min(ply, moves.length) - 1; i >= 0; i--) {
    if (moves[i].c === color && moves[i].clock !== undefined) return moves[i].clock;
  }
  return undefined;
}

/** Format seconds as h:mm:ss (dropping the hour when zero). */
export function formatClock(s: number): string {
  const sec = Math.max(0, Math.floor(s));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const ss = String(sec % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
