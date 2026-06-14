import { describe, expect, it } from "vitest";
import { loadModePreference, saveModePreference } from "./mode-preference";

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

describe("mode preference", () => {
  it("round-trips a saved choice", () => {
    const s = memoryStorage();
    saveModePreference(s, "deep");
    expect(loadModePreference(s)).toBe("deep");
    saveModePreference(s, "fast");
    expect(loadModePreference(s)).toBe("fast");
  });

  it("defaults to fast when nothing is stored", () => {
    expect(loadModePreference(memoryStorage())).toBe("fast");
  });

  it("ignores a malformed stored value, defaulting to fast", () => {
    const s = memoryStorage();
    s.setItem("gmbit.mode-preference", "nonsense");
    expect(loadModePreference(s)).toBe("fast");
  });
});
