import { describe, expect, it } from "vitest";
import {
  ANALYSIS_CACHE_VERSION,
  loadAnalysis,
  saveAnalysis,
  type CachedAnalysis,
} from "./analysis-cache";

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

const entry = (over: Partial<CachedAnalysis> = {}): CachedAnalysis => ({
  pgn: "1. e4 e5",
  mode: "fast",
  moves: [],
  whiteAccuracy: 90,
  blackAccuracy: 80,
  openingName: "Open Game",
  version: ANALYSIS_CACHE_VERSION,
  ...over,
});

describe("analysis cache", () => {
  it("round-trips a cached analysis by pgn", () => {
    const s = memoryStorage();
    saveAnalysis(s, entry());
    expect(loadAnalysis(s, "1. e4 e5")).toEqual(entry());
  });

  it("returns null when missing", () => {
    expect(loadAnalysis(memoryStorage(), "1. d4")).toBeNull();
  });

  it("dedupes by pgn and caps at 15", () => {
    const s = memoryStorage();
    for (let i = 0; i < 20; i++) saveAnalysis(s, entry({ pgn: `g${i}` }));
    saveAnalysis(s, entry({ pgn: "g0", whiteAccuracy: 50 }));
    // g0 was evicted by the cap, then re-added fresh at the front.
    expect(loadAnalysis(s, "g0")?.whiteAccuracy).toBe(50);
    expect(loadAnalysis(s, "g5")).toBeNull(); // beyond the cap
  });

  it("ignores entries from an older version", () => {
    const s = memoryStorage();
    saveAnalysis(s, entry({ version: ANALYSIS_CACHE_VERSION - 1 }));
    expect(loadAnalysis(s, "1. e4 e5")).toBeNull();
  });

  it("returns null on corrupt data and ignores write failures", () => {
    const s = memoryStorage();
    s.setItem("gmbit.analysis-cache", "{not json");
    expect(loadAnalysis(s, "x")).toBeNull();
    s.setItem = () => {
      throw new Error("quota");
    };
    expect(() => saveAnalysis(s, entry())).not.toThrow();
  });
});
