import { describe, expect, it } from "vitest";
import { parseInfoLine } from "./index";

describe("parseInfoLine", () => {
  it("parses a multipv line", () => {
    const info = parseInfoLine(
      "info depth 16 seldepth 24 multipv 2 score cp -31 nodes 1000 nps 500000 pv d7d5 e4d5",
    );
    expect(info).toMatchObject({ depth: 16, multipv: 2, cp: -31, pv: ["d7d5", "e4d5"] });
  });

  it("defaults multipv to 1 when absent", () => {
    const info = parseInfoLine("info depth 10 score cp 20 pv e2e4");
    expect(info?.multipv).toBe(1);
  });

  it("parses mate scores", () => {
    const info = parseInfoLine("info depth 12 multipv 1 score mate -3 pv g8h8");
    expect(info?.mate).toBe(-3);
  });

  it("returns null for lines without useful fields", () => {
    expect(parseInfoLine("info string NNUE evaluation enabled")).toBeNull();
  });
});
