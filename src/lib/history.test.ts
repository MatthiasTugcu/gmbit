import { describe, expect, it } from "vitest";
import { clearHistory, loadHistory, recordAnalysis, type HistoryEntry } from "./history";

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

const entry = (over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  pgn: "1. e4 e5",
  white: "A",
  black: "B",
  source: "pgn",
  date: 1,
  ...over,
});

describe("history store", () => {
  it("records newest-first", () => {
    const s = memoryStorage();
    recordAnalysis(s, entry({ pgn: "g1" }));
    recordAnalysis(s, entry({ pgn: "g2" }));
    expect(loadHistory(s).map((e) => e.pgn)).toEqual(["g2", "g1"]);
  });

  it("dedupes by pgn and promotes the re-opened game to the front", () => {
    const s = memoryStorage();
    recordAnalysis(s, entry({ pgn: "g1" }));
    recordAnalysis(s, entry({ pgn: "g2" }));
    recordAnalysis(s, entry({ pgn: "g1", date: 99 }));
    const list = loadHistory(s);
    expect(list.map((e) => e.pgn)).toEqual(["g1", "g2"]);
    expect(list[0].date).toBe(99);
  });

  it("caps at 15 entries", () => {
    const s = memoryStorage();
    for (let i = 0; i < 20; i++) recordAnalysis(s, entry({ pgn: `g${i}` }));
    expect(loadHistory(s)).toHaveLength(15);
    expect(loadHistory(s)[0].pgn).toBe("g19");
  });

  it("clears", () => {
    const s = memoryStorage();
    recordAnalysis(s, entry());
    clearHistory(s);
    expect(loadHistory(s)).toEqual([]);
  });

  it("returns [] on corrupt data and ignores write failures", () => {
    const s = memoryStorage();
    s.setItem("gmbit.history", "{not json");
    expect(loadHistory(s)).toEqual([]);
    s.setItem = () => {
      throw new Error("quota");
    };
    expect(() => recordAnalysis(s, entry())).not.toThrow();
  });
});
