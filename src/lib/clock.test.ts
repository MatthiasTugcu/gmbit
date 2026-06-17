import { describe, expect, it } from "vitest";
import type { Move } from "@/types/analysis";
import { clockAtPly, formatClock, timeControlBaseSeconds } from "./clock";

function mv(c: "w" | "b", clock?: number): Move {
  return { n: 1, c, san: "x", from: "a1", to: "a2", cls: "good", clock };
}

describe("timeControlBaseSeconds", () => {
  it("reads the base seconds from a simple time control", () => {
    expect(timeControlBaseSeconds("600")).toBe(600);
    expect(timeControlBaseSeconds("180+2")).toBe(180);
  });

  it("returns undefined for missing, none, or moves-per-period controls", () => {
    expect(timeControlBaseSeconds(undefined)).toBeUndefined();
    expect(timeControlBaseSeconds("-")).toBeUndefined();
    expect(timeControlBaseSeconds("40/9000")).toBeUndefined();
  });
});

describe("clockAtPly", () => {
  const moves = [mv("w", 300), mv("b", 290), mv("w", 280), mv("b", 270)];

  it("returns the last clock that color set by the given ply", () => {
    expect(clockAtPly(moves, 4, "w")).toBe(280);
    expect(clockAtPly(moves, 4, "b")).toBe(270);
    expect(clockAtPly(moves, 2, "w")).toBe(300);
  });

  it("returns undefined when that color has no clock yet", () => {
    expect(clockAtPly(moves, 1, "b")).toBeUndefined();
    expect(clockAtPly([], 0, "w")).toBeUndefined();
  });

  it("clamps a ply past the end to the available moves", () => {
    expect(clockAtPly(moves, 99, "b")).toBe(270);
  });
});

describe("formatClock", () => {
  it("formats minutes and seconds, zero-padding seconds", () => {
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(9)).toBe("0:09");
  });

  it("includes the hour when present, zero-padding minutes", () => {
    expect(formatClock(3661)).toBe("1:01:01");
  });

  it("floors fractional seconds and clamps negatives to zero", () => {
    expect(formatClock(59.9)).toBe("0:59");
    expect(formatClock(-5)).toBe("0:00");
  });
});
