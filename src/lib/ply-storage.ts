import type { AnalysisGame } from "@/lib/chess-game";

const PLY_KEY = "gmbit.ply";

/** Fingerprint a game so a stored ply is only restored for the same game. */
function gameKey(game: AnalysisGame): string {
  return `${game.moves.length}|${game.fens[game.fens.length - 1]}`;
}

export function savePly(storage: Storage, game: AnalysisGame, ply: number): void {
  try {
    storage.setItem(PLY_KEY, JSON.stringify({ key: gameKey(game), ply }));
  } catch {
    /* storage unavailable — ignore */
  }
}

/** Restore the ply stored for exactly this game, clamped to its length. */
export function loadPly(storage: Storage, game: AnalysisGame): number | null {
  try {
    const raw = storage.getItem(PLY_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as { key?: unknown }).key !== gameKey(game) ||
      typeof (parsed as { ply?: unknown }).ply !== "number"
    ) {
      return null;
    }
    const ply = (parsed as { ply: number }).ply;
    if (!Number.isFinite(ply)) return null;
    return Math.max(0, Math.min(game.moves.length, Math.round(ply)));
  } catch {
    return null;
  }
}
