import { describe, expect, it } from "vitest";
import { fetchRecentGames, toRecentGame, type ChesscomApiGame } from "./chesscom";

const game = (over: Partial<ChesscomApiGame> = {}): ChesscomApiGame => ({
  end_time: 1700000000,
  pgn: "1. e4 e5",
  time_class: "blitz",
  white: { username: "Hikaru", result: "win" },
  black: { username: "gothamchess", result: "resigned" },
  ...over,
});

describe("toRecentGame", () => {
  it("detects the user's side case-insensitively", () => {
    expect(toRecentGame(game(), "HIKARU")?.userSide).toBe("white");
    expect(toRecentGame(game(), "GothamChess")?.userSide).toBe("black");
  });

  it("maps win / draw codes / everything else to won / draw / lost", () => {
    expect(toRecentGame(game(), "hikaru")?.outcome).toBe("won");
    expect(toRecentGame(game(), "gothamchess")?.outcome).toBe("lost");
    const drawn = game({
      white: { username: "a", result: "stalemate" },
      black: { username: "b", result: "stalemate" },
    });
    expect(toRecentGame(drawn, "a")?.outcome).toBe("draw");
  });

  it("rejects games without a PGN or without the user", () => {
    expect(toRecentGame(game({ pgn: undefined }), "hikaru")).toBeNull();
    expect(toRecentGame(game(), "someoneelse")).toBeNull();
  });
});

describe("fetchRecentGames", () => {
  const jsonResponse = (body: unknown, status = 200) =>
    ({ ok: status < 400, status, json: async () => body }) as Response;

  it("walks archives newest-first and stops at the limit", async () => {
    const months: Record<string, ChesscomApiGame[]> = {
      "https://x/2024/01": [game({ end_time: 1 }), game({ end_time: 2 })],
      "https://x/2024/02": [game({ end_time: 3 }), game({ end_time: 4 })],
    };
    const fetchImpl = (async (url: string | URL | Request) => {
      const u = String(url);
      if (u.endsWith("/archives")) {
        return jsonResponse({ archives: Object.keys(months) });
      }
      return jsonResponse({ games: months[u] });
    }) as typeof fetch;

    const games = await fetchRecentGames("hikaru", 3, fetchImpl);
    expect(games.map((g) => g.endTime)).toEqual([4, 3, 2]);
  });

  it("reports an unknown player", async () => {
    const fetchImpl = (async () => jsonResponse({}, 404)) as typeof fetch;
    await expect(fetchRecentGames("nosuchuser", 10, fetchImpl)).rejects.toThrow(
      /No chess.com player/,
    );
  });
});
