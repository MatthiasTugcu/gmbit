import { describe, expect, it } from "vitest";
import {
  loadPendingFetch,
  loadPendingPgn,
  savePendingFetch,
  savePendingPgn,
  type PendingFetch,
} from "./pending-game";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  };
}

describe("pending game handoff", () => {
  it("round-trips a PGN", () => {
    const s = memoryStorage();
    savePendingPgn(s, "1. e4 e5");
    expect(loadPendingPgn(s)).toBe("1. e4 e5");
  });

  it("returns null when nothing is stored", () => {
    expect(loadPendingPgn(memoryStorage())).toBeNull();
  });

  it("survives a second load — refresh keeps the game", () => {
    const s = memoryStorage();
    savePendingPgn(s, "1. d4");
    loadPendingPgn(s);
    expect(loadPendingPgn(s)).toBe("1. d4");
  });
});

describe("pending fetch handoff", () => {
  const fetch: PendingFetch = {
    username: "ttuken",
    games: [
      {
        endTime: 1760000000,
        pgn: "1. e4 e5",
        white: "TTuken",
        black: "domcost",
        userSide: "white",
        outcome: "won",
        timeClass: "rapid",
      },
    ],
  };

  it("round-trips the fetched list", () => {
    const s = memoryStorage();
    savePendingFetch(s, fetch);
    expect(loadPendingFetch(s)).toEqual(fetch);
  });

  it("returns null when nothing is stored", () => {
    expect(loadPendingFetch(memoryStorage())).toBeNull();
  });

  it("returns null for corrupt or wrong-shape JSON", () => {
    const s = memoryStorage();
    s.setItem("gmbit.pending-fetch", "{not json");
    expect(loadPendingFetch(s)).toBeNull();
    s.setItem("gmbit.pending-fetch", JSON.stringify({ username: 5, games: "x" }));
    expect(loadPendingFetch(s)).toBeNull();
  });

  it("ignores storage write failures", () => {
    const s = memoryStorage();
    s.setItem = () => {
      throw new Error("quota");
    };
    expect(() => savePendingFetch(s, fetch)).not.toThrow();
  });
});
