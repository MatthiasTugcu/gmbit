import { describe, expect, it } from "vitest";
import type { Move } from "@/types/analysis";
import { moveSound, soundFromSan } from "./move-sound";

function mv(p: Partial<Move>): Move {
  return { n: 1, c: "w", san: "x", from: "a1", to: "a2", cls: "good", ...p };
}

describe("moveSound", () => {
  it("returns null for no move", () => {
    expect(moveSound(null)).toBeNull();
  });
  it("plays capture for any capturing move", () => {
    expect(moveSound(mv({ cap: true }))).toBe("capture");
    expect(moveSound(mv({ cap: true, check: true }))).toBe("capture");
    expect(moveSound(mv({ cap: true, mateMove: true }))).toBe("capture");
  });
  it("plays move for non-captures, including check and checkmate", () => {
    expect(moveSound(mv({}))).toBe("move");
    expect(moveSound(mv({ check: true }))).toBe("move");
    expect(moveSound(mv({ mateMove: true }))).toBe("move");
    expect(moveSound(mv({ castle: { rookFrom: "h1", rookTo: "f1" } }))).toBe("move");
    expect(moveSound(mv({ promo: "q" }))).toBe("move");
  });
});

describe("soundFromSan", () => {
  it("plays capture when the SAN has a capture", () => {
    expect(soundFromSan("exd5")).toBe("capture");
    expect(soundFromSan("Qxf7#")).toBe("capture");
    expect(soundFromSan("exf8=Q#")).toBe("capture");
  });
  it("plays move otherwise, including checks and checkmates", () => {
    expect(soundFromSan("Nf3")).toBe("move");
    expect(soundFromSan("Bb5+")).toBe("move");
    expect(soundFromSan("Qh7#")).toBe("move");
    expect(soundFromSan("O-O")).toBe("move");
  });
});
