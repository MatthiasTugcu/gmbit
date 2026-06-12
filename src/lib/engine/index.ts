/**
 * Stockfish engine, sandboxed behind a tiny async interface.
 *
 * Callers never see the Web Worker or UCI protocol — only:
 *   const engine = createEngine();
 *   const info = await engine.analyze(fen, { depth: 18, onProgress });
 *   engine.stop();      // cancel current analysis
 *   engine.destroy();   // tear down the worker
 *
 * Swapping this to a server endpoint later means changing only this file.
 */

export interface EngineLine {
  /** Centipawn evaluation from the side-to-move's perspective. */
  cp?: number;
  /** Mate in N (positive = side to move mates, negative = gets mated). */
  mate?: number;
  /** Principal variation, as UCI move strings. */
  pv: string[];
}

export interface AnalysisInfo {
  /** Depth of this report. */
  depth: number;
  /** Which MultiPV slot this info line belongs to (1 = best). */
  multipv: number;
  /** Centipawn evaluation from the side-to-move's perspective (line 1). */
  cp?: number;
  /** Mate in N (positive = side to move mates, negative = gets mated). */
  mate?: number;
  /** Principal variation of line 1, as UCI move strings (e.g. "e2e4"). */
  pv: string[];
  /** All requested lines, index 0 = best. Present on the final result. */
  lines?: EngineLine[];
  /** Nodes per second, when reported. */
  nps?: number;
}

export interface AnalyzeOptions {
  /** Target search depth. */
  depth?: number;
  /** Max think time in milliseconds. If both depth and movetime are set, both apply. */
  movetime?: number;
  /** Number of engine lines to search (UCI MultiPV). Default 1. */
  multiPv?: number;
  /** Called for each intermediate `info` line (line 1 only). */
  onProgress?: (info: AnalysisInfo) => void;
  /** Abort signal — calling abort() cancels the analysis. */
  signal?: AbortSignal;
}

export interface Engine {
  /** Run an analysis. Resolves with the final (deepest) info on bestmove. */
  analyze(fen: string, opts?: AnalyzeOptions): Promise<AnalysisInfo>;
  /** Stop the current analysis (resolves it with whatever info we have). */
  stop(): void;
  /** Terminate the underlying worker. */
  destroy(): void;
  /** Resolves once the engine has finished UCI handshake and is ready. */
  ready(): Promise<void>;
}

const STOCKFISH_URL = "/engine/stockfish-18-lite-single.js";

type Pending = {
  fen: string;
  opts: AnalyzeOptions;
  resolve: (info: AnalysisInfo) => void;
  reject: (err: unknown) => void;
  latest: AnalysisInfo | null;
  /** Latest line per MultiPV slot (key = multipv index). */
  lines: Map<number, EngineLine>;
  abortHandler?: () => void;
};

export function createEngine(): Engine {
  const worker = new Worker(STOCKFISH_URL);
  let current: Pending | null = null;
  let lastMultiPv = 1;

  let resolveReady: () => void = () => {};
  const readyPromise: Promise<void> = new Promise((r) => {
    resolveReady = r;
  });
  let isReady = false;

  // Track whether we've sent `uci` yet — the worker is built such that posting
  // `uci` triggers `uciok`, then we send `isready` and wait for `readyok`.
  let uciSent = false;

  function send(cmd: string) {
    worker.postMessage(cmd);
  }

  worker.onmessage = (e: MessageEvent<string>) => {
    const line = typeof e.data === "string" ? e.data : "";
    if (!line) return;

    if (!isReady) {
      if (line === "uciok") {
        send("isready");
        return;
      }
      if (line === "readyok") {
        isReady = true;
        resolveReady();
        return;
      }
    }

    if (current && line.startsWith("info ")) {
      const info = parseInfoLine(line);
      if (info) {
        if (info.pv.length > 0) {
          current.lines.set(info.multipv, { cp: info.cp, mate: info.mate, pv: info.pv });
        }
        // Only line 1 drives the top-level snapshot and progress callbacks,
        // so MultiPV >= 2 stays invisible to single-line consumers (and a
        // line-2 packet can't overwrite `latest`, which must track line 1).
        if (info.multipv === 1) {
          current.latest = info;
          current.opts.onProgress?.(info);
        }
      }
      return;
    }

    if (current && line.startsWith("bestmove")) {
      const finished = current;
      current = null;
      if (finished.abortHandler) {
        finished.opts.signal?.removeEventListener("abort", finished.abortHandler);
      }
      const bestmove = line.split(/\s+/)[1];
      // Mutating `final` is safe: `current` is already null, so no further
      // info lines can touch `finished.latest` before we resolve.
      const final = finished.latest ?? { depth: 0, multipv: 1, pv: [] };
      // Stockfish's last `info` line may lack a PV (currmove probes etc.).
      // The `bestmove` line is authoritative, so seed pv[0] from it.
      if (bestmove && bestmove !== "(none)" && (final.pv.length === 0 || final.pv[0] !== bestmove)) {
        final.pv = [bestmove, ...final.pv.slice(1)];
      }
      const ordered = [...finished.lines.entries()].sort((a, b) => a[0] - b[0]).map(([, l]) => l);
      if (ordered.length > 0) {
        ordered[0] = { ...ordered[0], pv: final.pv.length > 0 ? final.pv : ordered[0].pv };
        final.lines = ordered;
      }
      finished.resolve(final);
    }
  };

  worker.onerror = (e: ErrorEvent) => {
    if (current) {
      current.reject(e.error ?? new Error(e.message || "engine error"));
      current = null;
    }
  };

  function kickHandshake() {
    if (uciSent) return;
    uciSent = true;
    send("uci");
  }

  return {
    ready() {
      kickHandshake();
      return readyPromise;
    },
    async analyze(fen, opts = {}) {
      kickHandshake();
      await readyPromise;

      // If something is already running, stop it before starting a new search.
      if (current) {
        send("stop");
        // Wait for the in-flight `bestmove` so we don't race UCI state.
        await new Promise<void>((r) => {
          const prev = current;
          if (!prev) {
            r();
            return;
          }
          const origResolve = prev.resolve;
          prev.resolve = (info) => {
            origResolve(info);
            r();
          };
        });
      }

      return new Promise<AnalysisInfo>((resolve, reject) => {
        const pending: Pending = { fen, opts, resolve, reject, latest: null, lines: new Map() };
        current = pending;

        if (opts.signal) {
          if (opts.signal.aborted) {
            current = null;
            reject(new DOMException("Analysis aborted", "AbortError"));
            return;
          }
          pending.abortHandler = () => {
            if (current === pending) {
              send("stop");
            }
          };
          opts.signal.addEventListener("abort", pending.abortHandler, { once: true });
        }

        // Send setoption only on change: UCI forbids option changes during a
        // running search, and the engine remembers options across ucinewgame.
        const multiPv = opts.multiPv ?? 1;
        if (multiPv !== lastMultiPv) {
          send(`setoption name MultiPV value ${multiPv}`);
          lastMultiPv = multiPv;
        }
        send("ucinewgame");
        send(`position fen ${fen}`);
        const parts: string[] = ["go"];
        if (opts.depth) parts.push(`depth ${opts.depth}`);
        if (opts.movetime) parts.push(`movetime ${opts.movetime}`);
        if (parts.length === 1) parts.push("depth 18");
        send(parts.join(" "));
      });
    },
    stop() {
      if (current) send("stop");
    },
    destroy() {
      try {
        send("quit");
      } catch {
        /* ignore */
      }
      worker.terminate();
      if (current) {
        const c = current;
        current = null;
        c.reject(new Error("Engine destroyed"));
      }
    },
  };
}

/**
 * Parse a UCI `info` line into a structured snapshot. Returns null when the
 * line lacks the fields we care about (e.g. `info string ...`).
 */
export function parseInfoLine(line: string): AnalysisInfo | null {
  const tokens = line.split(/\s+/);
  let depth: number | undefined;
  let multipv: number | undefined;
  let cp: number | undefined;
  let mate: number | undefined;
  let nps: number | undefined;
  let pv: string[] = [];

  for (let i = 1; i < tokens.length; i++) {
    const tok = tokens[i];
    switch (tok) {
      case "depth":
        depth = Number(tokens[++i]);
        break;
      case "multipv":
        multipv = Number(tokens[++i]);
        break;
      case "nps":
        nps = Number(tokens[++i]);
        break;
      case "score": {
        const kind = tokens[++i];
        const value = Number(tokens[++i]);
        if (kind === "cp") cp = value;
        else if (kind === "mate") mate = value;
        break;
      }
      case "pv":
        pv = tokens.slice(i + 1);
        i = tokens.length;
        break;
      default:
        break;
    }
  }

  if (depth === undefined && cp === undefined && mate === undefined) return null;
  return { depth: depth ?? 0, multipv: multipv ?? 1, cp, mate, pv, nps };
}
