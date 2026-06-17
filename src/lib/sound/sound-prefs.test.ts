import { describe, expect, it } from "vitest";
import { loadMuted, saveMuted } from "./sound-prefs";

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

describe("sound prefs", () => {
  it("defaults to not muted when nothing is stored", () => {
    expect(loadMuted(memoryStorage())).toBe(false);
  });
  it("round-trips the muted flag", () => {
    const s = memoryStorage();
    saveMuted(s, true);
    expect(loadMuted(s)).toBe(true);
    saveMuted(s, false);
    expect(loadMuted(s)).toBe(false);
  });
  it("treats a malformed stored value as not muted", () => {
    const s = memoryStorage();
    s.setItem("gmbit.sound-muted", "nonsense");
    expect(loadMuted(s)).toBe(false);
  });
});
