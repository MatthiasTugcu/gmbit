"use client";

import { useEffect, useState } from "react";
import type { AnalysisGame } from "@/lib/chess-game";
import type { Move } from "@/types/analysis";
import {
  ACCURACY_HOPELESS,
  accMoverWinrate,
  classifyMove,
  gameAccuracy,
  moveAccuracy,
  type MoveAccEntry,
  type PositionEval,
  type Score,
} from "@/lib/analysis/classify";
import { bookMoves, loadOpenings, type BookInfo } from "@/lib/analysis/openings";
import { isSacrifice } from "@/lib/analysis/sacrifice";
import { createEngine, type AnalysisInfo, type Engine } from "./index";
import { mapPool } from "./pool";

const BASE_DEPTH = 14;
const REFINE_DEPTH = 20;
const MULTI_PV = 2;
/**
 * Hard cap per deep-pass search. Most positions reach depth 20 well inside
 * this; the cap only trims pathological positions that would otherwise hold
 * the whole analysis (and its progress bar) hostage for 30+ seconds.
 */
const REFINE_MOVETIME_MS = 5000;
/** Engine workers analysing in parallel. Each is a single-threaded WASM
 * Stockfish, so the pool scales with cores; leave headroom for the UI. */
const POOL_LANES = () =>
  Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 2));

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
export function toPositionEval(fen: string, info: AnalysisInfo): PositionEval {
  const sign = fen.split(" ")[1] === "b" ? -1 : 1;
  const raw =
    info.lines && info.lines.length > 0
      ? info.lines
      : [{ cp: info.cp, mate: info.mate, pv: info.pv }];
  return {
    lines: raw.map((l) => ({
      score: {
        cp: l.cp !== undefined ? l.cp * sign : undefined,
        // `mate 0` means the side to move is already checkmated — the mover
        // who delivered it is winning, so flip to a mate FOR the other side
        // (sign-flipping 0 alone would yield -0 and read as a 0% winrate,
        // turning every game-ending mating move into a "blunder").
        mate: l.mate !== undefined ? (l.mate === 0 ? -sign : l.mate * sign) : undefined,
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
  // Accuracy losses run on the steeper accuracy curve; classification inside
  // classifyMove keeps the lichess curve.
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

    const wBefore = accMoverWinrate(m.c, before.lines[0].score);
    const wAfter = accMoverWinrate(m.c, afterScore);
    const loss = Math.max(0, wBefore - wAfter);
    const hopeless = wBefore < ACCURACY_HOPELESS && wAfter < ACCURACY_HOPELESS;
    accEntries.push({ color: m.c, acc: moveAccuracy(loss), excluded: isBook || hopeless });
  }

  const { white, black } = gameAccuracy(accEntries);
  return { moves, white, black };
}

/**
 * Position indices for the deep pass: every position that feeds a non-book
 * move's classification or accuracy. Refining only "critical-looking"
 * positions inflates accuracy — a tactic the shallow pass misses entirely
 * never looks critical, so its loss stays at ~0 and the move scores ~100%.
 */
function refinementTargets(game: AnalysisGame, book: BookInfo): number[] {
  const targets = new Set<number>();
  for (let i = 0; i < game.moves.length; i++) {
    if (book.isBook[i]) continue;
    targets.add(i);
    targets.add(i + 1);
  }
  return [...targets].sort((a, b) => a - b);
}

/**
 * Two-pass Stockfish annotation: a quick pass at BASE_DEPTH / MultiPV 2 for
 * fast progressive feedback, then every non-book position again at
 * REFINE_DEPTH so final classifications and accuracy rest on uniformly deep
 * evals. Results are re-derived progressively as evals arrive.
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
    const engines: Engine[] = [];
    const destroyEngines = () => {
      engines.forEach((e) => e.destroy());
      engines.length = 0;
    };

    (async () => {
      try {
        const book = bookMoves(game.fens, await loadOpenings());
        if (cancelled) return;
        setOpeningName(book.openingName);

        // Both passes' search counts are known upfront, so the progress bar
        // is monotonic — no backward jump when the deep pass starts.
        const targets = refinementTargets(game, book);
        const totalSearches = game.fens.length + targets.length;
        let done = 0;
        setProgress({ done, total: totalSearches });

        for (let i = 0; i < POOL_LANES(); i++) engines.push(createEngine());
        await Promise.all(engines.map((e) => e.ready()));
        const positions: (PositionEval | undefined)[] = new Array(game.fens.length);

        const apply = () => {
          const { moves, white, black } = annotate(game, positions, book);
          setAnnotated((cur) => ({ ...cur, moves }));
          setAccuracy({ white, black });
        };

        const runPass = (indices: number[], depth: number, movetime?: number) =>
          mapPool(indices, engines.length, async (idx, lane) => {
            if (cancelled) return;
            const info = await engines[lane].analyze(game.fens[idx], {
              depth,
              multiPv: MULTI_PV,
              movetime,
            });
            if (cancelled) return;
            positions[idx] = toPositionEval(game.fens[idx], info);
            apply();
            done++;
            setProgress({ done, total: totalSearches });
          });

        // Base pass over every position, then the deep pass over every
        // position the classifications/accuracy use.
        await runPass(game.fens.map((_, i) => i), BASE_DEPTH);
        if (cancelled) return;
        await runPass(targets, REFINE_DEPTH, REFINE_MOVETIME_MS);
        // Analysis is finished — free the workers without waiting for the
        // next game change or unmount.
        destroyEngines();
      } catch (err) {
        // Aborts / teardown land here — stay silent for those; surface real bugs.
        if (!cancelled) console.error("game analysis failed:", err);
      }
    })();

    return () => {
      cancelled = true;
      destroyEngines();
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
