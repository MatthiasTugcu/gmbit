import type { RecentGame } from "./chesscom";

const PGN_KEY = "gmbit.pending-pgn";
const FETCH_KEY = "gmbit.pending-fetch";

/** The chess.com fetch a pending game came from, for the analyze sidebar. */
export interface PendingFetch {
  username: string;
  games: RecentGame[];
}

/** Stash the PGN the landing page hands off to /analyze. */
export function savePendingPgn(storage: Storage, pgn: string): void {
  try {
    storage.setItem(PGN_KEY, pgn);
  } catch {
    /* storage unavailable — ignore */
  }
}

/**
 * PGN stored by the landing page, if any. The value is kept (not consumed)
 * so a refresh of /analyze reloads the same game instead of the demo.
 */
export function loadPendingPgn(storage: Storage): string | null {
  try {
    return storage.getItem(PGN_KEY);
  } catch {
    return null;
  }
}

/** Stash the full fetched game list so /analyze can offer the player's other games. */
export function savePendingFetch(storage: Storage, fetch: PendingFetch): void {
  try {
    storage.setItem(FETCH_KEY, JSON.stringify(fetch));
  } catch {
    /* storage unavailable or quota exceeded — the sidebar just won't show games */
  }
}

/** The fetch stored by the landing page, if any and still parseable. */
export function loadPendingFetch(storage: Storage): PendingFetch | null {
  try {
    const raw = storage.getItem(FETCH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingFetch;
    if (typeof parsed?.username !== "string" || !Array.isArray(parsed.games)) return null;
    return parsed;
  } catch {
    return null;
  }
}
