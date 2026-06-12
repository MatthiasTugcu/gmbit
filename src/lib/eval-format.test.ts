import { describe, expect, it } from "vitest";
import { assessLabel, formatEval } from "./eval-format";

describe("formatEval", () => {
  it("formats centipawns as signed pawns", () => {
    expect(formatEval(30)).toBe("+0.3");
    expect(formatEval(-230)).toBe("−2.3");
  });

  it("formats a mate for white as M<n>", () => {
    expect(formatEval(undefined, 3)).toBe("M3");
  });

  it("formats a mate for black with a leading minus", () => {
    expect(formatEval(undefined, -3)).toBe("−M3");
  });

  it("formats delivered mate as #", () => {
    expect(formatEval(undefined, 0)).toBe("#");
  });
});

describe("assessLabel", () => {
  it("names the side that has the forced mate", () => {
    expect(assessLabel(undefined, 4)).toBe("Forced mate for White.");
    expect(assessLabel(undefined, -4)).toBe("Forced mate for Black.");
  });
});
