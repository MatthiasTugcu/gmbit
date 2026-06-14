/**
 * Human labels for a game's time control, read from the PGN `TimeControl`
 * header (base seconds, optionally `+increment`, or `moves/seconds` for daily).
 */

/** Format a raw TimeControl value: "60"→"1 min", "180+2"→"3+2", "1/86400"→"Daily". */
export function formatTimeControl(tc: string | undefined): string | null {
  if (!tc || tc === "-") return null;
  if (tc.includes("/")) return "Daily"; // correspondence, e.g. "1/259200"
  const [baseStr, incStr] = tc.split("+");
  const base = Number(baseStr);
  if (!Number.isFinite(base) || base <= 0) return null;
  const inc = Number(incStr) || 0;
  const minutes = base / 60;
  // Chess shorthand ("3+2") when there's an increment; otherwise a plain label.
  if (inc > 0) return `${Number.isInteger(minutes) ? minutes : base}+${inc}`;
  return Number.isInteger(minutes) ? `${minutes} min` : `${base} sec`;
}

/** Pull the TimeControl header out of a PGN and format it. */
export function timeControlLabel(pgn: string): string | null {
  const m = pgn.match(/\[TimeControl\s+"([^"]+)"\]/i);
  return m ? formatTimeControl(m[1]) : null;
}

export type TimeClass = "bullet" | "blitz" | "rapid" | "daily";

/**
 * Categorise a TimeControl like chess.com/lichess do, by estimated game length
 * (base + 40·increment): bullet < 3 min, blitz < 10 min, rapid otherwise;
 * correspondence ("moves/seconds") is daily.
 */
export function classFromTimeControl(tc: string | undefined): TimeClass | null {
  if (!tc || tc === "-") return null;
  if (tc.includes("/")) return "daily";
  const [baseStr, incStr] = tc.split("+");
  const base = Number(baseStr);
  if (!Number.isFinite(base) || base <= 0) return null;
  const estimate = base + 40 * (Number(incStr) || 0);
  if (estimate < 180) return "bullet";
  if (estimate < 600) return "blitz";
  return "rapid";
}

/** Time class from a PGN's TimeControl header. */
export function timeClassFromPgn(pgn: string): TimeClass | null {
  const m = pgn.match(/\[TimeControl\s+"([^"]+)"\]/i);
  return m ? classFromTimeControl(m[1]) : null;
}
