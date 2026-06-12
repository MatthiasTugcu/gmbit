/**
 * Client for chess.com's public game archives.
 *
 * The published API is CORS-enabled, so everything here runs in the browser:
 * /pub/player/{user}/games/archives lists monthly archive URLs (ascending);
 * each archive lists that month's games (ascending by end time).
 */

/** Slice of chess.com's published game object that we consume. */
export interface ChesscomApiGame {
  end_time: number;
  pgn?: string;
  time_class?: string;
  white: { username: string; result: string };
  black: { username: string; result: string };
}

export interface RecentGame {
  /** Unix seconds. */
  endTime: number;
  pgn: string;
  white: string;
  black: string;
  userSide: "white" | "black";
  outcome: "won" | "lost" | "draw";
  timeClass?: string;
}

/** chess.com result codes that mean a draw; everything else non-"win" is a loss. */
const DRAW_RESULTS = new Set([
  "agreed",
  "repetition",
  "stalemate",
  "insufficient",
  "50move",
  "timevsinsufficient",
]);

/**
 * Map an API game to a row for `username`, or null when the game is unusable
 * (no PGN — e.g. some variants — or the user somehow isn't a player in it).
 */
export function toRecentGame(g: ChesscomApiGame, username: string): RecentGame | null {
  if (!g.pgn) return null;
  const lower = username.trim().toLowerCase();
  const userSide =
    g.white.username.toLowerCase() === lower
      ? "white"
      : g.black.username.toLowerCase() === lower
        ? "black"
        : null;
  if (!userSide) return null;
  const result = userSide === "white" ? g.white.result : g.black.result;
  const outcome = result === "win" ? "won" : DRAW_RESULTS.has(result) ? "draw" : "lost";
  return {
    endTime: g.end_time,
    pgn: g.pgn,
    white: g.white.username,
    black: g.black.username,
    userSide,
    outcome,
    timeClass: g.time_class,
  };
}

/**
 * The user's most recent games, newest first, walking monthly archives
 * backwards until `limit` games are collected or history runs out.
 */
export async function fetchRecentGames(
  username: string,
  limit = 100,
  fetchImpl: typeof fetch = fetch,
): Promise<RecentGame[]> {
  const user = encodeURIComponent(username.trim().toLowerCase());
  const res = await fetchImpl(`https://api.chess.com/pub/player/${user}/games/archives`);
  if (res.status === 404) {
    throw new Error(`No chess.com player named “${username.trim()}”.`);
  }
  if (!res.ok) {
    throw new Error(`chess.com returned ${res.status} — try again later.`);
  }
  const { archives } = (await res.json()) as { archives: string[] };

  const games: RecentGame[] = [];
  for (let i = archives.length - 1; i >= 0 && games.length < limit; i--) {
    const monthRes = await fetchImpl(archives[i]);
    if (!monthRes.ok) continue;
    const month = (await monthRes.json()) as { games: ChesscomApiGame[] };
    for (let j = month.games.length - 1; j >= 0 && games.length < limit; j--) {
      const g = toRecentGame(month.games[j], username);
      if (g) games.push(g);
    }
  }
  return games;
}
