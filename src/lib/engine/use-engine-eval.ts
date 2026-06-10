"use client";

import { useEffect, useRef, useState } from "react";
import { uciLineToSan } from "@/lib/chess-game";
import { createEngine, type AnalysisInfo, type Engine } from "./index";

export interface EngineEval {
  /** Current search depth. */
  depth: number;
  /** Centipawn eval, white-positive (so the UI never needs to know whose turn it is). */
  cp?: number;
  /** Mate distance, white-positive. */
  mate?: number;
  /** Principal variation as SAN strings, ready to render. */
  pvSan: string[];
  /** First PV move in UCI form (e.g. "e2e4"), for drawing a best-move arrow. */
  bestUci?: string;
  /** Nodes per second, when reported. */
  nps?: number;
  /** True once we have at least one info line for the current fen. */
  hasResult: boolean;
}

const EMPTY: EngineEval = { depth: 0, pvSan: [], hasResult: false };

function sideToMove(fen: string): "w" | "b" {
  const parts = fen.split(" ");
  return parts[1] === "b" ? "b" : "w";
}

/** Re-orient an info packet so cp/mate are always white-positive. */
function toWhitePov(fen: string, info: AnalysisInfo): { cp?: number; mate?: number } {
  const sign = sideToMove(fen) === "w" ? 1 : -1;
  return {
    cp: info.cp !== undefined ? info.cp * sign : undefined,
    mate: info.mate !== undefined ? info.mate * sign : undefined,
  };
}

/**
 * Run continuous analysis on `fen`, switching whenever it changes.
 * The engine itself is created lazily on first call and torn down on unmount.
 */
export function useEngineEval(fen: string, depth = 20): EngineEval {
  const [snapshot, setSnapshot] = useState<EngineEval>(EMPTY);
  const engineRef = useRef<Engine | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Create / destroy the engine alongside the component lifecycle.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const engine = createEngine();
    engineRef.current = engine;
    return () => {
      abortRef.current?.abort();
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    // Reset between positions so stale numbers don't linger on the eval bar.
    setSnapshot(EMPTY);

    // Cancel any prior analysis.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let alive = true;
    const update = (info: AnalysisInfo) => {
      if (!alive) return;
      const { cp, mate } = toWhitePov(fen, info);
      const hasPv = info.pv.length > 0;
      setSnapshot((prev) => ({
        depth: info.depth || prev.depth,
        cp: cp ?? prev.cp,
        mate: mate ?? prev.mate,
        pvSan: hasPv ? uciLineToSan(fen, info.pv) : prev.pvSan,
        bestUci: hasPv ? info.pv[0] : prev.bestUci,
        nps: info.nps ?? prev.nps,
        hasResult: true,
      }));
    };

    engine
      .analyze(fen, {
        depth,
        signal: controller.signal,
        onProgress: update,
      })
      .then(update)
      .catch(() => {
        // Aborts and engine teardown both land here — silently ignore.
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [fen, depth]);

  return snapshot;
}
