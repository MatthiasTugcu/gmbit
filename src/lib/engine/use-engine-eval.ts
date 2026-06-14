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

/**
 * Finished searches keyed by `depth:fen`, so stepping back through moves
 * re-shows results instantly instead of re-searching from depth 1.
 */
const CACHE_MAX = 500;
const evalCache = new Map<string, EngineEval>();

function cachePut(key: string, value: EngineEval) {
  if (evalCache.size >= CACHE_MAX) {
    const oldest = evalCache.keys().next().value;
    if (oldest !== undefined) evalCache.delete(oldest);
  }
  evalCache.set(key, value);
}

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
 * The engine worker is created lazily on the first enabled search and torn
 * down on unmount. Pass `enabled: false` to pause (e.g. while the two-pass
 * game analysis owns the CPU) — the hook then reports EMPTY and runs nothing.
 */
export function useEngineEval(fen: string, depth = 20, enabled = true): EngineEval {
  // The snapshot is tagged with the position it belongs to: a stale snapshot
  // from the previous fen renders as EMPTY instead of lingering on the bar,
  // without needing a reset-setState inside the effect.
  const [snapshot, setSnapshot] = useState<{ key: string; value: EngineEval }>({
    key: "",
    value: EMPTY,
  });
  const engineRef = useRef<Engine | null>(null);

  // Tear the engine down with the component.
  useEffect(() => {
    return () => {
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, []);

  const cacheKey = `${depth}:${fen}`;
  const cached = enabled ? evalCache.get(cacheKey) : undefined;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    // Already searched to full depth — rendered straight from the cache.
    if (evalCache.has(`${depth}:${fen}`)) return;

    if (!engineRef.current) engineRef.current = createEngine();
    const engine = engineRef.current;

    const controller = new AbortController();
    let alive = true;
    let last = EMPTY;
    const toSnapshot = (info: AnalysisInfo): EngineEval => {
      const { cp, mate } = toWhitePov(fen, info);
      const hasPv = info.pv.length > 0;
      return {
        depth: info.depth || last.depth,
        cp: cp ?? last.cp,
        mate: mate ?? last.mate,
        pvSan: hasPv ? uciLineToSan(fen, info.pv) : last.pvSan,
        bestUci: hasPv ? info.pv[0] : last.bestUci,
        nps: info.nps ?? last.nps,
        hasResult: true,
      };
    };
    const key = `${depth}:${fen}`;
    const update = (info: AnalysisInfo) => {
      if (!alive) return;
      last = toSnapshot(info);
      setSnapshot({ key, value: last });
    };

    engine
      .analyze(fen, {
        depth,
        // Live eval owns the CPU (game analysis is paused while it runs), so the
        // single engine takes most cores. No-op on the single-threaded build.
        threads: Math.max(1, (navigator.hardwareConcurrency || 4) - 1),
        signal: controller.signal,
        onProgress: update,
      })
      .then((final) => {
        if (!alive) return;
        last = toSnapshot(final);
        cachePut(key, last);
        setSnapshot({ key, value: last });
      })
      .catch(() => {
        // Aborts and engine teardown both land here — silently ignore.
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [fen, depth, enabled]);

  return snapshot.key === cacheKey ? snapshot.value : (cached ?? EMPTY);
}
