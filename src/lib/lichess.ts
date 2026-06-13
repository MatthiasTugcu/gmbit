/**
 * Client for Lichess's public game export API.
 *
 * GET /api/games/user/{user} streams the user's games newest-first. With
 * `Accept: application/x-ndjson` it returns newline-delimited JSON (one game
 * per line). The endpoint is CORS-enabled and needs no auth for public games.
 */
import type { RecentGame } from "./chesscom";

/** Slice of Lichess's game object that we consume. */
export interface LichessApiGame {
  pgn?: string;
  winner?: "white" | "black";
  speed?: string;
  /** Unix milliseconds. */
  lastMoveAt?: number;
  players: {
    white?: { user?: { name?: string } };
    black?: { user?: { name?: string } };
  };
}

/** Map a Lichess game to a row for `username`, or null when unusable. */
export function toLichessRecentGame(g: LichessApiGame, username: string): RecentGame | null {
  if (!g.pgn) return null;
  const white = g.players?.white?.user?.name ?? "";
  const black = g.players?.black?.user?.name ?? "";
  const lower = username.trim().toLowerCase();
  const userSide =
    white.toLowerCase() === lower ? "white" : black.toLowerCase() === lower ? "black" : null;
  if (!userSide) return null;
  const outcome = !g.winner ? "draw" : g.winner === userSide ? "won" : "lost";
  return {
    endTime: Math.floor((g.lastMoveAt ?? 0) / 1000),
    pgn: g.pgn,
    white: white || "White",
    black: black || "Black",
    userSide,
    outcome,
    timeClass: g.speed,
  };
}

/** The user's most recent games, newest first. */
export async function fetchLichessGames(
  username: string,
  limit = 100,
  fetchImpl: typeof fetch = fetch,
): Promise<RecentGame[]> {
  const user = encodeURIComponent(username.trim());
  const res = await fetchImpl(
    `https://lichess.org/api/games/user/${user}?max=${limit}&pgnInJson=true`,
    { headers: { Accept: "application/x-ndjson" } },
  );
  if (res.status === 404) {
    throw new Error(`No Lichess player named "${username.trim()}".`);
  }
  if (res.status === 429) {
    throw new Error("Lichess is rate-limiting — wait a moment and try again.");
  }
  if (!res.ok) {
    throw new Error(`Lichess returned ${res.status} — try again later.`);
  }
  const text = await res.text();
  const games: RecentGame[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed: LichessApiGame;
    try {
      parsed = JSON.parse(trimmed) as LichessApiGame;
    } catch {
      continue; // skip a malformed line rather than failing the whole fetch
    }
    const mapped = toLichessRecentGame(parsed, username);
    if (mapped) games.push(mapped);
  }
  return games;
}
