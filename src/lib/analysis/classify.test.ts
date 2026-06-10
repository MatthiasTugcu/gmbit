import { describe, expect, it } from "vitest";
import { moveAccuracy, moverScore, moverWinrate, whiteWinrate } from "./classify";

describe("whiteWinrate", () => {
  it("maps cp through the lichess logistic", () => {
    expect(whiteWinrate({ cp: 0 })).toBeCloseTo(50, 5);
    expect(whiteWinrate({ cp: 100 })).toBeCloseTo(59.1, 1);
    expect(whiteWinrate({ cp: -100 })).toBeCloseTo(40.9, 1);
    expect(whiteWinrate({ cp: 5000 })).toBeCloseTo(whiteWinrate({ cp: 1500 }), 5); // clamped
  });
  it("treats mate as 0/100", () => {
    expect(whiteWinrate({ mate: 3 })).toBe(100);
    expect(whiteWinrate({ mate: -1 })).toBe(0);
  });
  it("defaults to 50 with no data", () => {
    expect(whiteWinrate({})).toBe(50);
  });
});

describe("moverWinrate", () => {
  it("flips for black", () => {
    expect(moverWinrate("b", { cp: -100 })).toBeCloseTo(59.1, 1);
    expect(moverWinrate("b", { mate: -2 })).toBe(100);
  });
});

describe("moverScore (total order: mate-for > cp > mate-against)", () => {
  it("ranks faster mates higher", () => {
    expect(moverScore("w", { mate: 2 })).toBeGreaterThan(moverScore("w", { mate: 5 }));
  });
  it("ranks any mate-for above any cp", () => {
    expect(moverScore("w", { mate: 30 })).toBeGreaterThan(moverScore("w", { cp: 1500 }));
  });
  it("ranks slower mates-against higher (less bad)", () => {
    expect(moverScore("w", { mate: -5 })).toBeGreaterThan(moverScore("w", { mate: -2 }));
    expect(moverScore("w", { cp: -1500 })).toBeGreaterThan(moverScore("w", { mate: -30 }));
  });
  it("is symmetric for black", () => {
    expect(moverScore("b", { mate: -2 })).toBe(moverScore("w", { mate: 2 }));
    expect(moverScore("b", { cp: -120 })).toBe(moverScore("w", { cp: 120 }));
  });
});

describe("moveAccuracy", () => {
  it("matches the published lichess curve", () => {
    expect(moveAccuracy(0)).toBeCloseTo(100, 1);
    expect(moveAccuracy(10)).toBeCloseTo(63.6, 1);
    expect(moveAccuracy(20)).toBeCloseTo(40.0, 1);
    expect(moveAccuracy(100)).toBe(0);
  });
  it("clamps negative loss (depth noise) to 100", () => {
    expect(moveAccuracy(-3)).toBeCloseTo(100, 1);
  });
});
