import { describe, expect, it } from "vitest";
import { toPositionEval } from "./use-game-analysis";
import type { AnalysisInfo } from "./index";

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
