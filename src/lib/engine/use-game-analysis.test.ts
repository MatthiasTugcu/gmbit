import { describe, expect, it } from "vitest";
import { annotate, searchTotal, MODE_CONFIG, toPositionEval } from "./use-game-analysis";
import type { AnalysisInfo } from "./index";
import type { AnalysisGame } from "@/lib/chess-game";
import type { BookInfo } from "@/lib/analysis/openings";
import type { PositionEval } from "@/lib/analysis/classify";

const W_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const B_FEN = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

function info(partial: Partial<AnalysisInfo>): AnalysisInfo {
  return { depth: 12, multipv: 1, pv: [], ...partial };
}

describe("toPositionEval", () => {
  it("keeps white-to-move scores as-is", () => {
    const ev = toPositionEval(W_FEN, info({ cp: 35, pv: ["e2e4"] }));
    expect(ev.lines[0].score.cp).toBe(35);
    expect(ev.lines[0].uci).toBe("e2e4");
  });

  it("flips black-to-move scores to white-positive", () => {
    const ev = toPositionEval(B_FEN, info({ cp: 35 }));
    expect(ev.lines[0].score.cp).toBe(-35);
    // Black to move, side-to-move gets mated in 2 => white mates => +2.
    expect(toPositionEval(B_FEN, info({ mate: -2 })).lines[0].score.mate).toBe(2);
  });

  it("treats `mate 0` (side to move is checkmated) as a win for the mover", () => {
    // Black to move and already mated: white just delivered mate.
    expect(toPositionEval(B_FEN, info({ mate: 0 })).lines[0].score.mate).toBe(1);
    // White to move and already mated: black just delivered mate.
    expect(toPositionEval(W_FEN, info({ mate: 0 })).lines[0].score.mate).toBe(-1);
  });

  it("maps MultiPV lines preserving order", () => {
    const ev = toPositionEval(
      B_FEN,
      info({
        lines: [
          { cp: -20, pv: ["d7d5", "e4d5"] },
          { cp: -45, pv: ["g8f6"] },
        ],
      }),
    );
    expect(ev.lines).toHaveLength(2);
    expect(ev.lines[0].score.cp).toBe(20);
    expect(ev.lines[1].score.cp).toBe(45);
    expect(ev.lines[1].uci).toBe("g8f6");
  });
});

describe("searchTotal", () => {
  it("counts base + refine passes in deep mode", () => {
    expect(searchTotal(40, 30, "deep")).toBe(70);
  });

  it("counts only the base pass in fast mode", () => {
    expect(searchTotal(40, 30, "fast")).toBe(40);
  });
});

describe("MODE_CONFIG", () => {
  it("skips the deep pass in fast mode and keeps it in deep mode", () => {
    expect(MODE_CONFIG.fast.refineDepth).toBeNull();
    expect(MODE_CONFIG.deep.refineDepth).toBe(20);
  });
});

describe("annotate classification gating", () => {
  // A clear white blunder: best was e2e4 (+0.5); the played e2e3 leaves white
  // losing badly (-8.0). fens are unused here (the sacrifice probe only fires
  // on best-matching moves, which this isn't).
  const game: AnalysisGame = {
    startingFen: W_FEN,
    fens: [W_FEN, W_FEN],
    headers: {},
    moves: [{ n: 1, c: "w", san: "e3", from: "e2", to: "e3", cls: "good" }],
  };
  const positions: PositionEval[] = [
    { lines: [{ score: { cp: 50 }, uci: "e2e4" }] },
    { lines: [{ score: { cp: -800 }, uci: "e7e5" }] },
  ];
  const book: BookInfo = { isBook: [false], openingName: null };

  it("withholds the move rating during the run (classify=false) but still applies the eval", () => {
    const { moves, white, black } = annotate(game, positions, book, false);
    expect(moves[0].cls).toBe("good"); // neutral default kept — no badge shown yet
    expect(moves[0].cp).toBe(-800); // eval still flows to the live graph
    expect(white).toBeGreaterThanOrEqual(0); // accuracy still computed
    expect(black).toBe(0); // no black moves
  });

  it("reveals the real rating once analysis completes (classify=true)", () => {
    const during = annotate(game, positions, book, false);
    const done = annotate(game, positions, book, true);
    expect(done.moves[0].cls).not.toBe("good"); // reclassified as the blunder it is
    expect(done.moves[0].cp).toBe(-800);
    // Accuracy is independent of the classify flag — only the label is gated.
    expect(done.white).toBe(during.white);
    expect(done.black).toBe(during.black);
  });
});
