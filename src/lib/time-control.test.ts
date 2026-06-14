import { describe, expect, it } from "vitest";
import { classFromTimeControl, formatTimeControl, timeControlLabel } from "./time-control";

describe("formatTimeControl", () => {
  it("labels whole-minute base times", () => {
    expect(formatTimeControl("60")).toBe("1 min");
    expect(formatTimeControl("180")).toBe("3 min");
    expect(formatTimeControl("600")).toBe("10 min");
  });

  it("uses chess shorthand when there's an increment", () => {
    expect(formatTimeControl("180+2")).toBe("3+2");
    expect(formatTimeControl("900+10")).toBe("15+10");
  });

  it("falls back to seconds for sub-minute base times", () => {
    expect(formatTimeControl("30")).toBe("30 sec");
  });

  it("labels correspondence games as Daily", () => {
    expect(formatTimeControl("1/86400")).toBe("Daily");
  });

  it("returns null for missing or malformed values", () => {
    expect(formatTimeControl(undefined)).toBeNull();
    expect(formatTimeControl("-")).toBeNull();
    expect(formatTimeControl("abc")).toBeNull();
  });
});

describe("classFromTimeControl", () => {
  it("categorises by estimated game length", () => {
    expect(classFromTimeControl("60")).toBe("bullet"); // 1 min
    expect(classFromTimeControl("120+1")).toBe("bullet"); // est 160s
    expect(classFromTimeControl("180")).toBe("blitz"); // 3 min
    expect(classFromTimeControl("300")).toBe("blitz"); // 5 min
    expect(classFromTimeControl("600")).toBe("rapid"); // 10 min
    expect(classFromTimeControl("900+10")).toBe("rapid");
    expect(classFromTimeControl("1/86400")).toBe("daily");
  });

  it("returns null for missing/malformed", () => {
    expect(classFromTimeControl(undefined)).toBeNull();
    expect(classFromTimeControl("-")).toBeNull();
  });
});

describe("timeControlLabel", () => {
  it("reads the TimeControl header from a PGN", () => {
    expect(timeControlLabel('[White "a"]\n[TimeControl "60"]\n\n1. e4 *')).toBe("1 min");
    expect(timeControlLabel('[TimeControl "180+2"]\n\n1. e4 *')).toBe("3+2");
  });

  it("returns null when the PGN has no TimeControl", () => {
    expect(timeControlLabel("1. e4 e5 *")).toBeNull();
  });
});
