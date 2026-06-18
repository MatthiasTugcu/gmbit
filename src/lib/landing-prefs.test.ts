import { describe, expect, it } from "vitest";
import { loadUsername, saveUsername } from "./landing-prefs";

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

describe("landing-prefs username", () => {
  it("round-trips a username per source", () => {
    const s = memoryStorage();
    saveUsername(s, "chesscom", "hikaru");
    expect(loadUsername(s, "chesscom")).toBe("hikaru");
  });

  it("returns empty string when nothing stored", () => {
    expect(loadUsername(memoryStorage(), "chesscom")).toBe("");
  });

  it("ignores storage failures", () => {
    const s = memoryStorage();
    s.setItem = () => {
      throw new Error("quota");
    };
    expect(() => saveUsername(s, "chesscom", "x")).not.toThrow();
  });
});
