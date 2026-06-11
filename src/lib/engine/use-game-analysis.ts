"use client";

import { useEffect, useState } from "react";
import type { AnalysisGame } from "@/lib/chess-game";
import type { Move } from "@/types/analysis";
import {
  classifyMove,
  gameAccuracy,
  moveAccuracy,
  moverWinrate,
  whiteWinrate,
  type MoveAccEntry,
  type PositionEval,
  type Score,
} from "@/lib/analysis/classify";
import { bookMoves, loadOpenings, type BookInfo } from "@/lib/analysis/openings";
import { isSacrifice } from "@/lib/analysis/sacrifice";
import { createEngine, type AnalysisInfo } from "./index";

const BASE_DEPTH = 16;
const REFINE_DEPTH = 20;
const MULTI_PV = 2;
/** Win% swing that flags a position as critical for the refinement pass. */
const REFINE_SWING = 15;
/** Best-vs-second gap that makes a move a Great candidate worth refining. */
const REFINE_GAP = 8;

export interface GameAnalysisProgress {
  done: number;
  total: number;
  running: boolean;
}

export interface GameAnalysisResult {
  game: AnalysisGame;
  whiteAccuracy: number;
  blackAccuracy: number;
  openingName: string | null;
  progress: GameAnalysisProgress;
}

/** Convert a side-to-move engine result into a white-positive PositionEval. */
function toPositionEval(fen: string, info: AnalysisInfo): PositionEval {
  const sign = fen.split(" ")[1] === "b" ? -1 : 1;
  const raw =
    info.lines && info.lines.length > 0
      ? info.lines
      : [{ cp: info.cp, mate: info.mate, pv: info.pv }];
  return {
    lines: raw.map((l) => ({
      score: {
        cp: l.cp !== undefined ? l.cp * sign : undefined,
        mate: l.mate !== undefined ? l.mate * sign : undefined,
      },
      uci: l.pv[0],
    })),
  };
}

interface Annotated {
  moves: Move[];
  white: number;
  black: number;
}

/**
 * Re-derive every classification + both accuracies from whatever evals exist.
 * Pure and cheap (n = plies), so it simply reruns whenever evals change.
 */
function annotate(
  game: AnalysisGame,
  positions: (PositionEval | undefined)[],
  book: BookInfo,
): Annotated {
  const moves = game.moves.slice();
  const accEntries: MoveAccEntry[] = [];
  const winrates: number[] = [];
  if (positions[0]) winrates.push(whiteWinrate(positions[0].lines[0].score));

  for (let i = 0; i < moves.length; i++) {
    const before = positions[i];
    const after = positions[i + 1];
    if (!before || !after) break;
    const m = moves[i];
    const afterScore: Score = after.lines[0].score;
    const playedUci = m.from + m.to + (m.promo ?? "");
    const isBook = book.isBook[i] ?? false;
    const cls = classifyMove({
      mover: m.c,
      playedUci,
      before,
      after: afterScore,
      isBook,
      sacrifice: () => isSacrifice(game.fens[i], playedUci),
    });
    moves[i] = { ...m, cls, cp: afterScore.cp, mate: afterScore.mate };

    const loss = Math.max(
      0,
      moverWinrate(m.c, before.lines[0].score) - moverWinrate(m.c, afterScore),
    );
    accEntries.push({ color: m.c, acc: moveAccuracy(loss), isBook });
    winrates.push(whiteWinrate(afterScore));
  }

  const { white, black } = gameAccuracy(accEntries, winrates);
  return { moves, white, black };
}

/** Position indices worth a deeper look after the base pass. */
function refinementTargets(
  game: AnalysisGame,
  positions: (PositionEval | undefined)[],
  annotatedMoves: Move[],
  book: BookInfo,
): number[] {
  const targets = new Set<number>();
  for (let i = 0; i < game.moves.length; i++) {
    const before = positions[i];
    const after = positions[i + 1];
    if (!before || !after || book.isBook[i]) continue;
    const m = game.moves[i];
    const cls = annotatedMoves[i].cls;
    const wBefore = moverWinrate(m.c, before.lines[0].score);
    const wAfter = moverWinrate(m.c, after.lines[0].score);
    const second = before.lines[1];
    const gap = second ? wBefore - moverWinrate(m.c, second.score) : 0;
    const playedUci = m.from + m.to + (m.promo ?? "");
    const playedIsBest = before.lines[0].uci === playedUci;

    const critical =
      cls === "mistake" ||
      cls === "blunder" ||
      cls === "miss" ||
      cls === "great" ||
      cls === "brilliant" ||
      (playedIsBest && gap >= REFINE_GAP) ||
      Math.abs(wBefore - wAfter) >= REFINE_SWING;

    if (critical) {
      targets.add(i);
      targets.add(i + 1);
    }
  }
  return [...targets].sort((a, b) => a - b);
}

/**
 * Two-pass Stockfish annotation: every position at BASE_DEPTH / MultiPV 2,
 * then critical positions again at REFINE_DEPTH. Classifications, accuracies
 * and the opening name are re-derived progressively as evals arrive.
 */
export function useGameAnalysis(game: AnalysisGame): GameAnalysisResult {
  const [annotated, setAnnotated] = useState<AnalysisGame>(game);
  const [accuracy, setAccuracy] = useState({ white: 0, black: 0 });
  const [openingName, setOpeningName] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: game.moves.length });

  useEffect(() => {
    // Reset-on-game-change: React batches these into one render; the linter's
    // set-state-in-effect rule false-positives on this standard pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAnnotated(game);
    setAccuracy({ white: 0, black: 0 });
    setOpeningName(null);
    setProgress({ done: 0, total: game.moves.length });

    if (typeof window === "undefined") return;
    if (game.moves.length === 0) return;
    // Pre-annotated games (e.g. the bundled demo) skip engine analysis.
    if (game.moves.every((m) => m.cp !== undefined || m.mate !== undefined)) {
      setProgress({ done: game.moves.length, total: game.moves.length });
      return;
    }

    let cancelled = false;
    const engine = createEngine();

    (async () => {
      try {
        const book = bookMoves(game.fens, await loadOpenings());
        if (cancelled) return;
        setOpeningName(book.openingName);

        await engine.ready();
        const positions: (PositionEval | undefined)[] = new Array(game.fens.length);

        const apply = () => {
          const { moves, white, black } = annotate(game, positions, book);
          setAnnotated((cur) => ({ ...cur, moves }));
          setAccuracy({ white, black });
        };

        // Base pass.
        for (let i = 0; i < game.fens.length; i++) {
          if (cancelled) return;
          const info = await engine.analyze(game.fens[i], {
            depth: BASE_DEPTH,
            multiPv: MULTI_PV,
          });
          if (cancelled) return;
          positions[i] = toPositionEval(game.fens[i], info);
          if (i > 0) {
            apply();
            setProgress((p) => ({ ...p, done: i }));
          }
        }

        // Refinement pass over critical positions.
        const base = annotate(game, positions, book);
        const targets = refinementTargets(game, positions, base.moves, book);
        setProgress({ done: game.moves.length, total: game.moves.length + targets.length });
        for (let t = 0; t < targets.length; t++) {
          if (cancelled) return;
          const idx = targets[t];
          const info = await engine.analyze(game.fens[idx], {
            depth: REFINE_DEPTH,
            multiPv: MULTI_PV,
          });
          if (cancelled) return;
          positions[idx] = toPositionEval(game.fens[idx], info);
          apply();
          setProgress((p) => ({ ...p, done: game.moves.length + t + 1 }));
        }
      } catch (err) {
        // Aborts / teardown land here — stay silent for those; surface real bugs.
        if (!cancelled) console.error("game analysis failed:", err);
      }
    })();

    return () => {
      cancelled = true;
      engine.destroy();
    };
  }, [game]);

  return {
    game: annotated,
    whiteAccuracy: accuracy.white,
    blackAccuracy: accuracy.black,
    openingName,
    progress: {
      done: progress.done,
      total: progress.total,
      running: progress.done < progress.total,
    },
  };
}
