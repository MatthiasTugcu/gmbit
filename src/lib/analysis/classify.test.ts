import { describe, expect, it } from "vitest";
import {
  classifyMove,
  decidedForAccuracy,
  gameAccuracy,
  moveAccuracy,
  moverScore,
  moverWinrate,
  whiteWinrate,
  type ClassifyArgs,
  type MoveAccEntry,
} from "./classify";

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

/** Baseline args: a quiet non-book move in an equal position. */
function args(over: Partial<ClassifyArgs>): ClassifyArgs {
  return {
    mover: "w",
    playedUci: "g1f3",
    before: { lines: [{ score: { cp: 30 }, uci: "e2e4" }, { score: { cp: 10 }, uci: "d2d4" }] },
    after: { cp: 20 },
    isBook: false,
    sacrifice: () => false,
    ...over,
  };
}

describe("classifyMove ladder", () => {
  it("book wins over everything", () => {
    expect(classifyMove(args({ isBook: true, after: { cp: -500 } }))).toBe("book");
  });

  it("best: exact uci match including promotion piece", () => {
    // lines[1] at cp:350 keeps gap to lines[0] at ~2.96 win% (< 12) -> 'best' not 'great'
    expect(
      classifyMove(
        args({
          playedUci: "e7e8q",
          before: { lines: [{ score: { cp: 400 }, uci: "e7e8q" }, { score: { cp: 350 }, uci: "a1a2" }] },
          after: { cp: 380 },
        }),
      ),
    ).toBe("best");
    // Underpromotion when the engine wanted a queen is NOT best.
    // after cp:200 gives moverScore 200 < best.score 400 -> asGoodAsBest=false; not matchesBest -> not best
    expect(
      classifyMove(
        args({
          playedUci: "e7e8n",
          before: { lines: [{ score: { cp: 400 }, uci: "e7e8q" }, { score: { cp: 350 }, uci: "a1a2" }] },
          after: { cp: 200 },
        }),
      ),
    ).not.toBe("best");
  });

  it("best: a different move that evaluates at least as well counts as best", () => {
    expect(
      classifyMove(
        args({
          playedUci: "d2d4",
          before: { lines: [{ score: { cp: 30 }, uci: "e2e4" }, { score: { cp: 25 }, uci: "d2d4" }] },
          after: { cp: 35 }, // played move turned out better than predicted best
        }),
      ),
    ).toBe("best");
  });

  it("best-by-eval does not apply in dead-lost mate positions", () => {
    // Mover is getting mated either way; equal-winrate (0) must not auto-best.
    expect(
      classifyMove(
        args({
          playedUci: "h2h3",
          before: { lines: [{ score: { mate: -5 }, uci: "g1f1" }] },
          after: { mate: -3 }, // faster mate against: strictly worse by moverScore
        }),
      ),
    ).not.toBe("best");
  });

  it("great: best move when the second line is >= 12 win% worse", () => {
    expect(
      classifyMove(
        args({
          playedUci: "e2e4",
          before: { lines: [{ score: { cp: 50 }, uci: "e2e4" }, { score: { cp: -100 }, uci: "d2d4" }] },
          after: { cp: 45 },
          // gap: moverWinrate(w,{cp:50}) - moverWinrate(w,{cp:-100}) = 54.59 - 40.90 = 13.69 >= 12
        }),
      ),
    ).toBe("great");
  });

  it("great: held equality where the next-best line would have lost it", () => {
    // steep curve: best 67.9% vs 2nd 43.8% -> gap 24.1 (>= GREAT_GAP); best holds
    // >= 50 while the only alternative drops below -> a losing line turned equal.
    expect(
      classifyMove(
        args({
          playedUci: "e2e4",
          before: { lines: [{ score: { cp: 150 }, uci: "e2e4" }, { score: { cp: -50 }, uci: "d2d4" }] },
          after: { cp: 145 },
        }),
      ),
    ).toBe("great");
  });

  it("great: secured the win where the next-best line stayed only equal", () => {
    // steep curve: best 77.7% (winning) vs 2nd 59.9% -> gap 17.8 (>= GREAT_GAP);
    // best secures the win the alternative would not -> an equal line turned won.
    expect(
      classifyMove(
        args({
          playedUci: "e2e4",
          before: { lines: [{ score: { cp: 250 }, uci: "e2e4" }, { score: { cp: 80 }, uci: "d2d4" }] },
          after: { cp: 245 },
        }),
      ),
    ).toBe("great");
  });

  it("best (not great): small gap, no decisive boundary crossed", () => {
    // best 62.2% vs 2nd 57.4% -> gap 4.85 (< GREAT_GAP) -> just a best move.
    expect(
      classifyMove(
        args({
          playedUci: "e2e4",
          before: { lines: [{ score: { cp: 100 }, uci: "e2e4" }, { score: { cp: 60 }, uci: "d2d4" }] },
          after: { cp: 95 },
        }),
      ),
    ).toBe("best");
  });

  it("best (not great): a forced recapture is an only-move but never great", () => {
    // same decisive-swing shape as the held-equality great, but flagged recapture.
    expect(
      classifyMove(
        args({
          playedUci: "e2e4",
          before: { lines: [{ score: { cp: 150 }, uci: "e2e4" }, { score: { cp: -50 }, uci: "d2d4" }] },
          after: { cp: 145 },
          recapture: true,
        }),
      ),
    ).toBe("best");
  });

  it("best (not great): an only-move while already winning is just converting", () => {
    // best 88% (> GREAT_MAX) with a huge gap to the 2nd line -> mopping up, not great.
    expect(
      classifyMove(
        args({
          playedUci: "e2e4",
          before: { lines: [{ score: { cp: 400 }, uci: "e2e4" }, { score: { cp: -100 }, uci: "d2d4" }] },
          after: { cp: 395 },
        }),
      ),
    ).toBe("best");
  });

  it("brilliant: best + sacrifice, not lost after, not already crushing", () => {
    const a = args({
      playedUci: "d3h7",
      before: { lines: [{ score: { cp: 150 }, uci: "d3h7" }, { score: { cp: -200 }, uci: "a1a2" }] },
      after: { cp: 140 },
      sacrifice: () => true,
    });
    expect(classifyMove(a)).toBe("brilliant");
    // Already completely winning -> downgraded (no cheap brilliancies up a queen).
    expect(
      classifyMove({
        ...a,
        before: { lines: [{ score: { cp: 1400 }, uci: "d3h7" }] },
        after: { cp: 1390 },
      }),
    ).not.toBe("brilliant");
  });

  it("excellent under 2, good under 5", () => {
    // before cp:10->after cp:0 is ~0.92 win% loss; clearly < 2 -> excellent
    expect(
      classifyMove(
        args({
          before: { lines: [{ score: { cp: 10 }, uci: "e2e4" }, { score: { cp: 5 }, uci: "d2d4" }] },
          after: { cp: 0 },
        }),
      ),
    ).toBe("excellent");
    // before cp:80->after cp:0 is ~7.31 win% loss -> inaccuracy
    expect(
      classifyMove(
        args({
          before: { lines: [{ score: { cp: 80 }, uci: "e2e4" }] },
          after: { cp: 0 },
        }),
      ),
    ).toBe("inaccuracy");
    // before cp:35->after cp:0 is ~4.36 win% loss (steep curve) -> good (2 <= loss < 5)
    expect(
      classifyMove(
        args({
          before: { lines: [{ score: { cp: 35 }, uci: "e2e4" }] },
          after: { cp: 0 },
        }),
      ),
    ).toBe("good");
  });

  it("miss: a decisive chance thrown away lands as miss, not mistake/blunder", () => {
    expect(
      classifyMove(
        args({
          before: { lines: [{ score: { mate: 2 }, uci: "d1h5" }] }, // mate available
          after: { cp: 50 }, // back to near-equal
          // wBefore=100, wAfter=54.59, loss=45.41 >= 10, wAfter < 60 (MISS_AFTER), hadMate=true -> miss
        }),
      ),
    ).toBe("miss");
    expect(
      classifyMove(
        args({
          before: { lines: [{ score: { cp: 600 }, uci: "d1h5" }] }, // ~90.11 win%
          after: { cp: 30 }, // ~52.76 win%
          // wBefore=90.11 >= 75 (MISS_BEFORE), wAfter=52.76 < 60 (MISS_AFTER), loss=37.35 >= 10 -> miss
        }),
      ),
    ).toBe("miss");
  });

  it("hanging mate-in-1 is a blunder even from a winning position", () => {
    expect(
      classifyMove(
        args({
          before: { lines: [{ score: { cp: 600 }, uci: "d1h5" }] },
          after: { mate: -1 },
        }),
      ),
    ).toBe("blunder");
  });

  it("inaccuracy / mistake / blunder thresholds", () => {
    const base = { lines: [{ score: { cp: 0 }, uci: "e2e4" }] };
    // steep curve. cp 0->-80: loss ~9.9 -> inaccuracy
    expect(classifyMove(args({ before: base, after: { cp: -80 } }))).toBe("inaccuracy");
    // cp 0->-150: loss ~17.9 -> mistake
    expect(classifyMove(args({ before: base, after: { cp: -150 } }))).toBe("mistake");
    // cp 0->-600: loss ~45.3 -> blunder
    expect(classifyMove(args({ before: base, after: { cp: -600 } }))).toBe("blunder");
  });

  it("newly allowing a forced mate upgrades inaccuracy to mistake", () => {
    // steep curve: before cp -520 (~6.9 win% for white) -> after mate -5 (0 win%):
    // loss ~6.9 -> [5,10) band. Without allowsMate it would be "inaccuracy"; the
    // upgrade makes it "mistake". wBefore < 75, so the miss rule does not fire.
    expect(
      classifyMove(
        args({
          before: { lines: [{ score: { cp: -520 }, uci: "g1f1" }] },
          after: { mate: -5 },
        }),
      ),
    ).toBe("mistake");
  });

  it("handles black as the mover (sign flips)", () => {
    // Black to move: mate:-2 in best.score means mate FOR black; moverWinrate('b',{mate:-2})=100.
    // After cp:-50 (black slightly better) moverWinrate('b',{cp:-50})~54.6 win%.
    // loss ~45.4 >= 10, wAfter < 60 (MISS_AFTER), hadMate=true -> miss.
    expect(
      classifyMove(
        args({
          mover: "b",
          before: { lines: [{ score: { mate: -2 }, uci: "d8h4" }] },
          after: { cp: -50 }, // black still slightly better (~54.6 for black) but mate gone
        }),
      ),
    ).toBe("miss");
    // Black hangs mate-in-1 (after mate: 1 = white mates next move).
    // oppMatesIn1: mover=b, after.mate===1 -> true -> blunder.
    expect(
      classifyMove(
        args({
          mover: "b",
          before: { lines: [{ score: { cp: -600 }, uci: "d8h4" }] }, // black ~90 win%
          after: { mate: 1 },
        }),
      ),
    ).toBe("blunder");
  });
});

function entries(pattern: [color: "w" | "b", acc: number, excluded?: boolean][]): MoveAccEntry[] {
  return pattern.map(([color, acc, excluded]) => ({ color, acc, excluded: excluded ?? false }));
}

describe("gameAccuracy", () => {
  it("perfect play is 100 for both sides", () => {
    const e = entries([["w", 100], ["b", 100], ["w", 100], ["b", 100]]);
    expect(gameAccuracy(e)).toEqual({ white: 100, black: 100 });
  });

  it("book moves are excluded entirely", () => {
    // White: two book moves (acc irrelevant) + one 80-acc move -> only the 80 counts.
    const e = entries([["w", 0, true], ["b", 100], ["w", 0, true], ["b", 100], ["w", 80]]);
    expect(gameAccuracy(e).white).toBe(80);
  });

  it("harmonic mean drags the score toward blunders more than a plain average", () => {
    const e = entries([["w", 100], ["w", 100], ["w", 100], ["w", 20]]);
    const { white } = gameAccuracy(e);
    expect(white).toBeLessThan(80); // plain average
    expect(white).toBeGreaterThan(20);
  });

  it("floors blunders so one catastrophe can't crater the game score", () => {
    // acc 0 and acc 25 games score identically: the harmonic term is floored.
    const zero = entries([["w", 100], ["w", 100], ["w", 100], ["w", 0]]);
    const floored = entries([["w", 100], ["w", 100], ["w", 100], ["w", 25]]);
    expect(gameAccuracy(zero).white).toBe(gameAccuracy(floored).white);
    expect(gameAccuracy(zero).white).toBeGreaterThan(50);
  });

  it("returns 0 for a side with no countable moves", () => {
    const e = entries([["w", 100]]);
    expect(gameAccuracy(e).black).toBe(0);
  });
});

describe("decidedForAccuracy", () => {
  it("excludes a move lost for both sides (hopeless)", () => {
    expect(decidedForAccuracy(10, 5)).toBe(true);
  });

  it("excludes a move that keeps an already-won position winning", () => {
    // 99.9% -> 62%: a deep-search swing in a decided win, not a real blunder.
    expect(decidedForAccuracy(99.9, 62)).toBe(true);
  });

  it("still counts a move that throws a winning position away", () => {
    // 88% -> 12%: dropped below 'still winning', so it stays counted.
    expect(decidedForAccuracy(88, 12)).toBe(false);
  });

  it("counts normal, contested moves", () => {
    expect(decidedForAccuracy(60, 45)).toBe(false);
    expect(decidedForAccuracy(37, 0)).toBe(false); // losing side, but not 'decided' by the win% read
  });
});
