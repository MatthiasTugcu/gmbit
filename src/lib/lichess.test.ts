import { describe, expect, it } from "vitest";
import { fetchLichessGames, toLichessRecentGame, type LichessApiGame } from "./lichess";

const game = (over: Partial<LichessApiGame> = {}): LichessApiGame => ({
  pgn: "1. e4 e5",
  speed: "blitz",
  lastMoveAt: 1700000000000,
  winner: "white",
  players: {
    white: { user: { name: "DrNykterstein" } },
    black: { user: { name: "foo" } },
  },
  ...over,
});

describe("toLichessRecentGame", () => {
  it("detects the user's side case-insensitively", () => {
    expect(toLichessRecentGame(game(), "drnykterstein")?.userSide).toBe("white");
    expect(toLichessRecentGame(game(), "FOO")?.userSide).toBe("black");
  });

  it("maps winner / no-winner to won / lost / draw", () => {
    expect(toLichessRecentGame(game(), "DrNykterstein")?.outcome).toBe("won");
    expect(toLichessRecentGame(game(), "foo")?.outcome).toBe("lost");
    expect(toLichessRecentGame(game({ winner: undefined }), "foo")?.outcome).toBe("draw");
  });

  it("converts lastMoveAt ms to endTime seconds", () => {
    expect(toLichessRecentGame(game(), "foo")?.endTime).toBe(1700000000);
  });

  it("rejects games without a PGN or without the user", () => {
    expect(toLichessRecentGame(game({ pgn: undefined }), "foo")).toBeNull();
    expect(toLichessRecentGame(game(), "someoneelse")).toBeNull();
  });

  it("handles anonymous opponents without throwing", () => {
    const anon = game({ players: { white: { user: { name: "foo" } }, black: {} } });
    expect(toLichessRecentGame(anon, "foo")?.userSide).toBe("white");
  });
});

describe("fetchLichessGames", () => {
  const ndjsonResponse = (lines: unknown[], status = 200) =>
    ({
      ok: status < 400,
      status,
      text: async () => lines.map((l) => JSON.stringify(l)).join("\n"),
    }) as Response;

  it("parses ndjson newest-first and skips blank/unparseable lines", async () => {
    const body = `${JSON.stringify(game({ lastMoveAt: 2000 }))}\n\n{bad\n${JSON.stringify(
      game({ lastMoveAt: 1000 }),
    )}\n`;
    const fetchImpl = (async () => ({ ok: true, status: 200, text: async () => body }) as Response) as typeof fetch;
    const games = await fetchLichessGames("foo", 10, fetchImpl);
    expect(games.map((g) => g.endTime)).toEqual([2, 1]);
  });

  it("reports an unknown player", async () => {
    const fetchImpl = (async () => ndjsonResponse([], 404)) as typeof fetch;
    await expect(fetchLichessGames("nosuchuser", 10, fetchImpl)).rejects.toThrow(/No Lichess player/);
  });

  it("reports rate limiting", async () => {
    const fetchImpl = (async () => ndjsonResponse([], 429)) as typeof fetch;
    await expect(fetchLichessGames("foo", 10, fetchImpl)).rejects.toThrow(/rate-limit/);
  });
});
