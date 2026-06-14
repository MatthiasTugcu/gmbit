/**
 * Local cache of completed game analyses, keyed by PGN, so re-opening a game
 * from history skips the (expensive) Stockfish pass and restores the annotated
 * moves, accuracies, and opening directly.
 *
 * Only the lightweight derived result is stored — not the per-position engine
 * PV lines — so a handful of games stays well within localStorage limits.
 */
import type { AnalysisMode, Move } from "@/types/analysis";

export interface CachedAnalysis {
  pgn: string;
  /** Effort the game was analysed at, shown in the recent-games list. */
  mode: AnalysisMode;
  moves: Move[];
  whiteAccuracy: number;
  blackAccuracy: number;
  openingName: string | null;
  /** Bumped when the stored shape changes, to invalidate stale entries. */
  version: number;
}

const KEY = "gmbit.analysis-cache";
const CAP = 15;
/** Bump to discard caches written by an incompatible analysis format. */
export const ANALYSIS_CACHE_VERSION = 2;

function loadAll(storage: Storage): CachedAnalysis[] {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CachedAnalysis[]) : [];
  } catch {
    return [];
  }
}

/** The cached analysis for `pgn`, if present and of the current version. */
export function loadAnalysis(storage: Storage, pgn: string): CachedAnalysis | null {
  const hit = loadAll(storage).find((e) => e.pgn === pgn);
  return hit && hit.version === ANALYSIS_CACHE_VERSION ? hit : null;
}

/** Persist a completed analysis: newest-first, deduped by PGN, capped. */
export function saveAnalysis(storage: Storage, entry: CachedAnalysis): void {
  try {
    const list = loadAll(storage).filter((e) => e.pgn !== entry.pgn);
    list.unshift(entry);
    storage.setItem(KEY, JSON.stringify(list.slice(0, CAP)));
  } catch {
    /* storage unavailable or quota exceeded — analysis just re-runs next time */
  }
}
