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
  it("plays game-end on checkmate, even when it is also a capture", () => {
    expect(moveSound(mv({ mateMove: true, cap: true, check: true }))).toBe("game-end");
  });
  it("plays check on a checking move, even when it is a capture", () => {
    expect(moveSound(mv({ check: true, cap: true }))).toBe("check");
  });
  it("plays capture on a plain capture", () => {
    expect(moveSound(mv({ cap: true }))).toBe("capture");
  });
  it("plays move on a quiet move (incl. castle / promotion)", () => {
    expect(moveSound(mv({}))).toBe("move");
    expect(moveSound(mv({ castle: { rookFrom: "h1", rookTo: "f1" } }))).toBe("move");
    expect(moveSound(mv({ promo: "q" }))).toBe("move");
  });
});

describe("soundFromSan", () => {
  it("maps checkmate '#'", () => {
    expect(soundFromSan("Qxf7#")).toBe("game-end");
  });
  it("maps check '+'", () => {
    expect(soundFromSan("Bb5+")).toBe("check");
  });
  it("maps capture 'x'", () => {
    expect(soundFromSan("exd5")).toBe("capture");
  });
  it("maps a quiet move", () => {
    expect(soundFromSan("Nf3")).toBe("move");
    expect(soundFromSan("O-O")).toBe("move");
  });
  it("prioritises mate over capture for a capture-promotion-mate", () => {
    expect(soundFromSan("exf8=Q#")).toBe("game-end");
  });
});
