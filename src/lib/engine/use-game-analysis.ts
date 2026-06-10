"use client";

import { useEffect, useState } from "react";
import type { AnalysisGame } from "@/lib/chess-game";
import type { Move, MoveClass } from "@/types/analysis";
import { createEngine } from "./index";

/** White-positive eval for one position in the game, plus the engine's top move. */
interface PovEval {
  cp?: number;
  mate?: number;
  /** Engine's PV[0] in UCI form (e.g. "e2e4" or "e7e8q"). */
  bestUci?: string;
}

/** First N plies are tagged "book" when the move is reasonable in the opening. */
const OPENING_PLIES = 16;

export interface GameAnalysisProgress {
  done: number;
  total: number;
  running: boolean;
}

export interface GameAnalysisResult {
  game: AnalysisGame;
  whiteAccuracy: number;
  blackAccuracy: number;
  progress: GameAnalysisProgress;
}

/** Depth used for batch annotation — shallower than live eval to keep wall-time reasonable. */
const DEPTH = 14;

/**
 * Walk Stockfish across every position in `game` and progressively fill in
 * per-move cp / mate / classification. Returns the live snapshot plus progress.
 */
export function useGameAnalysis(game: AnalysisGame): GameAnalysisResult {
  const [annotated, setAnnotated] = useState<AnalysisGame>(game);
  const [evals, setEvals] = useState<PovEval[]>([]);
  const [done, setDone] = useState(0);

  useEffect(() => {
    setAnnotated(game);
    setEvals([]);
    setDone(0);

    if (typeof window === "undefined") return;
    if (game.moves.length === 0) return;
    // If every move already carries an eval, the game is pre-annotated (e.g. the demo).
    if (game.moves.every((m) => m.cp !== undefined || m.mate !== undefined)) {
      setDone(game.moves.length);
      return;
    }

    let cancelled = false;
    const engine = createEngine();

    (async () => {
      try {
        await engine.ready();
        const local: PovEval[] = [];

        for (let i = 0; i < game.fens.length; i++) {
          if (cancelled) return;
          const info = await engine.analyze(game.fens[i], { depth: DEPTH });
          if (cancelled) return;

          const stm = game.fens[i].split(" ")[1] === "b" ? "b" : "w";
          const sign = stm === "w" ? 1 : -1;
          const ev: PovEval = {
            cp: info.cp !== undefined ? info.cp * sign : undefined,
            mate: info.mate !== undefined ? info.mate * sign : undefined,
            bestUci: info.pv[0],
          };
          local.push(ev);
          setEvals(local.slice());

          if (i > 0) {
            const moveIdx = i - 1;
            const m = game.moves[moveIdx];
            const before = local[i - 1];
            const isBest = movePlayedIsEngineBest(m, before.bestUci);
            const isOpening = moveIdx < OPENING_PLIES;
            const cls = classifyMove(m.c, before, ev, { isBest, isOpening });
            setAnnotated((cur) => {
              const moves = cur.moves.slice();
              moves[moveIdx] = { ...moves[moveIdx], cls, cp: ev.cp, mate: ev.mate };
              return { ...cur, moves };
            });
            setDone(moveIdx + 1);
          }
        }
      } catch {
        // Aborts / teardown land here — silently stop.
      }
    })();

    return () => {
      cancelled = true;
      engine.destroy();
    };
  }, [game]);

  const { whiteAccuracy, blackAccuracy } = computeAccuracies(annotated.moves, evals, done);

  return {
    game: annotated,
    whiteAccuracy,
    blackAccuracy,
    progress: { done, total: game.moves.length, running: done < game.moves.length },
  };
}

/** Lichess-style logistic mapping centipawns → winrate (0..100) for White. */
function winrate({ cp, mate }: PovEval): number {
  if (mate !== undefined) return mate > 0 ? 100 : 0;
  if (cp === undefined) return 50;
  const clamped = Math.max(-1500, Math.min(1500, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clamped)) - 1);
}

function movePlayedIsEngineBest(m: Move, bestUci: string | undefined): boolean {
  if (!bestUci || bestUci.length < 4) return false;
  return bestUci.slice(0, 4) === m.from + m.to;
}

function classifyMove(
  mover: "w" | "b",
  before: PovEval,
  after: PovEval,
  opts: { isBest: boolean; isOpening: boolean },
): MoveClass {
  const wBefore = winrate(before);
  const wAfter = winrate(after);
  const moverBefore = mover === "w" ? wBefore : 100 - wBefore;
  const moverAfter = mover === "w" ? wAfter : 100 - wAfter;
  const loss = moverBefore - moverAfter;

  // "Best" requires actually matching the engine's top choice — otherwise even
  // a near-zero-loss move is just "good" or "book", not best.
  if (opts.isBest) return "best";
  if (opts.isOpening && loss < 5) return "book";
  if (loss < 5) return "good";
  if (loss < 10) return "inaccuracy";
  if (loss < 20) return "mistake";
  return "blunder";
}

function moveAccuracyFromLoss(loss: number): number {
  const a = 103.1668 * Math.exp(-0.04354 * Math.max(0, loss)) - 3.1668;
  return Math.max(0, Math.min(100, a));
}

function computeAccuracies(
  moves: Move[],
  evals: PovEval[],
  done: number,
): { whiteAccuracy: number; blackAccuracy: number } {
  if (done === 0 || evals.length < 2) return { whiteAccuracy: 0, blackAccuracy: 0 };
  let wSum = 0;
  let wCount = 0;
  let bSum = 0;
  let bCount = 0;
  for (let i = 0; i < done && i + 1 < evals.length; i++) {
    const before = evals[i];
    const wB = winrate(before);
    const wA = winrate(evals[i + 1]);
    const m = moves[i];
    const moverB = m.c === "w" ? wB : 100 - wB;
    const moverA = m.c === "w" ? wA : 100 - wA;
    // Floor non-best moves at ~2 winrate points of loss — depth noise can flip
    // the raw delta negative, but a move the engine didn't pick shouldn't score 100%.
    const isBest = movePlayedIsEngineBest(m, before.bestUci);
    const rawLoss = moverB - moverA;
    const loss = isBest ? Math.max(0, rawLoss) : Math.max(2, rawLoss);
    const acc = moveAccuracyFromLoss(loss);
    if (m.c === "w") {
      wSum += acc;
      wCount++;
    } else {
      bSum += acc;
      bCount++;
    }
  }
  return {
    whiteAccuracy: wCount ? Math.round(wSum / wCount) : 0,
    blackAccuracy: bCount ? Math.round(bSum / bCount) : 0,
  };
}
