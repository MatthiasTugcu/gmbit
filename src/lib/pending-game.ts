import type { RecentGame } from "./chesscom";
import type { AnalysisMode } from "@/types/analysis";

const PGN_KEY = "gmbit.pending-pgn";
const FETCH_KEY = "gmbit.pending-fetch";

/** The chess.com fetch a pending game came from, for the analyze sidebar. */
export interface PendingFetch {
  username: string;
  games: RecentGame[];
  /** Which provider the games came from (absent on legacy entries = chess.com). */
  source?: "chesscom" | "lichess";
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

const MODE_KEY = "gmbit.pending-mode";
const META_KEY = "gmbit.pending-meta";

/** Where a pending game came from, for the recent-analyses history. */
export interface PendingMeta {
  source: "chesscom" | "lichess" | "pgn" | "demo";
  outcome?: "won" | "lost" | "draw";
}

/** Remove the stashed PGN so /analyze falls back to the demo game. */
export function clearPendingPgn(storage: Storage): void {
  try {
    storage.removeItem(PGN_KEY);
  } catch {
    /* storage unavailable — ignore */
  }
}

/** Stash the analysis effort chosen on the landing page. */
export function savePendingMode(storage: Storage, mode: AnalysisMode): void {
  try {
    storage.setItem(MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

/** The chosen mode, defaulting to "deep" when missing or unrecognised. */
export function loadPendingMode(storage: Storage): AnalysisMode {
  try {
    return storage.getItem(MODE_KEY) === "fast" ? "fast" : "deep";
  } catch {
    return "deep";
  }
}

/** Stash where the pending game came from (for history). */
export function savePendingMeta(storage: Storage, meta: PendingMeta): void {
  try {
    storage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    /* ignore */
  }
}

/** The pending game's source meta, if any and parseable. */
export function loadPendingMeta(storage: Storage): PendingMeta | null {
  try {
    const raw = storage.getItem(META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingMeta;
    return typeof parsed?.source === "string" ? parsed : null;
  } catch {
    return null;
  }
}
