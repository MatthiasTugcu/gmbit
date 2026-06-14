import type { AnalysisMode } from "@/types/analysis";

/** Locally-stored list of recently analysed games for quick re-open. */
export type HistorySource = "chesscom" | "lichess" | "pgn" | "demo";

export interface HistoryEntry {
  pgn: string;
  white: string;
  black: string;
  outcome?: "won" | "lost" | "draw";
  source: HistorySource;
  /** Unix milliseconds when last analysed. */
  date: number;
  /** Effort the game was analysed at — filled in once analysis completes. */
  mode?: AnalysisMode;
  /** Per-side accuracy percentages — filled in once analysis completes. */
  whiteAccuracy?: number;
  blackAccuracy?: number;
}

const KEY = "gmbit.history";
const CAP = 15;

/** All stored entries, newest first; [] when none / unreadable. */
export function loadHistory(storage: Storage): HistoryEntry[] {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

/**
 * Record an analysed game: dedupe by exact PGN (re-opening promotes the entry
 * to the front and refreshes its date), newest first, capped at CAP.
 */
export function recordAnalysis(storage: Storage, entry: HistoryEntry): void {
  try {
    const list = loadHistory(storage).filter((e) => e.pgn !== entry.pgn);
    list.unshift(entry);
    storage.setItem(KEY, JSON.stringify(list.slice(0, CAP)));
  } catch {
    /* storage unavailable or quota exceeded — ignore */
  }
}

/**
 * Merge analysis results (mode + accuracies) into an existing entry, matched by
 * PGN. No-op if the game isn't in history (e.g. the demo). Order is preserved.
 */
export function updateAnalysis(
  storage: Storage,
  pgn: string,
  fields: Pick<HistoryEntry, "mode" | "whiteAccuracy" | "blackAccuracy">,
): void {
  try {
    const list = loadHistory(storage);
    const i = list.findIndex((e) => e.pgn === pgn);
    if (i === -1) return;
    list[i] = { ...list[i], ...fields };
    storage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable — ignore */
  }
}

/** Empty the history. */
export function clearHistory(storage: Storage): void {
  try {
    storage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
