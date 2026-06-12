/**
 * Accuracy calibration harness.
 *
 *   node scripts/calibrate.ts <game.pgn> <chesscomWhite> <chesscomBlack>
 *
 * Analyzes the game with the same engine, depth and MultiPV the app's deep
 * pass uses, runs the app's actual accuracy math over the evals, and sweeps
 * the accuracy win-curve steepness (ACCURACY_WIN_K) and harmonic floor
 * against the accuracy chess.com reported for the same game.
 *
 * Engine results are cached in /tmp so parameter sweeps re-run instantly.
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Chess } from "chess.js";
import {
  gameAccuracy,
  moveAccuracy,
  type MoveAccEntry,
  type PositionEval,
  type Score,
} from "../src/lib/analysis/classify.ts";
import { bookMoves, type OpeningsMap } from "../src/lib/analysis/openings.ts";
import { parseInfoLine, type AnalysisInfo, type EngineLine } from "../src/lib/engine/index.ts";

const DEPTH = 20;
const MULTI_PV = 2;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_PATH = "/tmp/gmbit-eval-cache.json";

// ---------------------------------------------------------------- game setup

const [pgnPath, targetWhiteArg, targetBlackArg] = process.argv.slice(2);
if (!pgnPath) {
  console.error("usage: node scripts/calibrate.ts <game.pgn> [chesscomWhite] [chesscomBlack]");
  process.exit(1);
}
const targetWhite = Number(targetWhiteArg ?? NaN);
const targetBlack = Number(targetBlackArg ?? NaN);

const pgn = readFileSync(pgnPath, "utf8").replace(/\$\d+/g, "");
const chess = new Chess();
chess.loadPgn(pgn);
const history = chess.history({ verbose: true });
const fens = [history[0].before, ...history.map((m) => m.after)];

const openings = JSON.parse(
  readFileSync(join(ROOT, "src/data/openings.json"), "utf8"),
) as OpeningsMap;
const book = bookMoves(fens, openings);

// ------------------------------------------------------------------- engine

interface Searcher {
  analyze(fen: string): Promise<AnalysisInfo>;
  quit(): void;
}

async function startEngine(): Promise<Searcher> {
  const child = spawn("node", [join(ROOT, "public/engine/stockfish-18-lite-single.js")], {
    stdio: ["pipe", "pipe", "inherit"],
  });
  const rl = createInterface({ input: child.stdout! });
  let onLine: (line: string) => void = () => {};
  rl.on("line", (l) => onLine(l));
  const send = (c: string) => child.stdin!.write(c + "\n");

  await new Promise<void>((resolve) => {
    onLine = (line) => {
      if (line === "uciok") send("isready");
      else if (line === "readyok") resolve();
    };
    send("uci");
  });
  send(`setoption name MultiPV value ${MULTI_PV}`);

  return {
    analyze(fen) {
      return new Promise((resolve) => {
        const lines = new Map<number, EngineLine>();
        let latest: AnalysisInfo | null = null;
        onLine = (line) => {
          if (line.startsWith("info ")) {
            const info = parseInfoLine(line);
            if (!info) return;
            if (info.pv.length > 0) {
              lines.set(info.multipv, { cp: info.cp, mate: info.mate, pv: info.pv });
            }
            if (info.multipv === 1) latest = info;
          } else if (line.startsWith("bestmove")) {
            const final = latest ?? { depth: 0, multipv: 1, pv: [] };
            const ordered = [...lines.entries()].sort((a, b) => a[0] - b[0]).map(([, l]) => l);
            if (ordered.length > 0) final.lines = ordered;
            resolve(final);
          }
        };
        send("ucinewgame");
        send(`position fen ${fen}`);
        send(`go depth ${DEPTH}`);
      });
    },
    quit() {
      send("quit");
      child.kill();
    },
  };
}

/**
 * Mirror of toPositionEval in src/lib/engine/use-game-analysis.ts — that
 * module imports React and `@/` path aliases Node can't resolve.
 */
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
        mate: l.mate !== undefined ? (l.mate === 0 ? -sign : l.mate * sign) : undefined,
      },
      uci: l.pv[0],
    })),
  };
}

async function evaluateAll(): Promise<PositionEval[]> {
  const cache: Record<string, AnalysisInfo> = existsSync(CACHE_PATH)
    ? JSON.parse(readFileSync(CACHE_PATH, "utf8"))
    : {};
  const key = (fen: string) => `${fen}|d${DEPTH}|mpv${MULTI_PV}`;
  const missing = fens.filter((f) => !cache[key(f)]);

  if (missing.length > 0) {
    const engine = await startEngine();
    for (let i = 0; i < missing.length; i++) {
      const info = await engine.analyze(missing[i]);
      cache[key(missing[i])] = info;
      writeFileSync(CACHE_PATH, JSON.stringify(cache));
      process.stderr.write(`\reval ${i + 1}/${missing.length} (depth ${DEPTH})   `);
    }
    process.stderr.write("\n");
    engine.quit();
  }
  return fens.map((f) => toPositionEval(f, cache[key(f)]));
}

// --------------------------------------------------- parametric accuracy math

function winrate(s: Score, k: number): number {
  if (s.mate !== undefined) return s.mate > 0 ? 100 : 0;
  if (s.cp === undefined) return 50;
  const clamped = Math.max(-1500, Math.min(1500, s.cp));
  return 50 + 50 * (2 / (1 + Math.exp(-k * clamped)) - 1);
}

function moverWin(color: "w" | "b", s: Score, k: number): number {
  const w = winrate(s, k);
  return color === "w" ? w : 100 - w;
}

interface PerMove {
  entry: MoveAccEntry;
  loss: number;
  /** Position already decided (same side, mover win% outside [D, 100-D]) both before and after. */
  decided: (d: number) => boolean;
  /** Decided AGAINST the mover (win% < D before and after) — dead-lost shuffling. */
  hopeless: (d: number) => boolean;
}

function perMove(positions: PositionEval[], k: number): { moves: PerMove[]; winrates: number[] } {
  const moves: PerMove[] = [];
  const winrates: number[] = [winrate(positions[0].lines[0].score, k)];
  for (let i = 0; i < history.length; i++) {
    const color = history[i].color as "w" | "b";
    const before = positions[i].lines[0].score;
    const after = positions[i + 1].lines[0].score;
    const wBefore = moverWin(color, before, k);
    const wAfter = moverWin(color, after, k);
    const loss = Math.max(0, wBefore - wAfter);
    moves.push({
      entry: { color, acc: moveAccuracy(loss), excluded: book.isBook[i] ?? false },
      loss,
      decided: (d) =>
        (wBefore < d && wAfter < d) || (wBefore > 100 - d && wAfter > 100 - d),
      hopeless: (d) => wBefore < d && wAfter < d,
    });
    winrates.push(winrate(after, k));
  }
  return { moves, winrates };
}

/** Mirror of classify.gameAccuracy with a parametric harmonic floor. */
function gameAccuracyLocal(
  moves: MoveAccEntry[],
  floor: number,
): { white: number; black: number } {
  const perColor = (color: "w" | "b"): number => {
    const accs = moves.filter((m) => m.color === color && !m.excluded).map((m) => m.acc);
    if (accs.length === 0) return 0;
    const harmonic = accs.length / accs.reduce((sum, a) => sum + 1 / Math.max(a, floor), 0);
    return Math.round(harmonic * 10) / 10;
  };
  return { white: perColor("w"), black: perColor("b") };
}

// --------------------------------------------------------------------- main

const APP_K = 0.005; // must match ACCURACY_WIN_K in classify.ts
const APP_FLOOR = 25; // must match ACCURACY_FLOOR in classify.ts
const APP_HOPELESS = 15; // must match ACCURACY_HOPELESS in classify.ts

const positions = await evaluateAll();

const appEntries = (moves: PerMove[]) =>
  moves.map((m) => ({ ...m.entry, excluded: m.entry.excluded || m.hopeless(APP_HOPELESS) }));

// Self-check: the local parametric math must reproduce the app's gameAccuracy
// exactly at the app's parameters, or the sweep is calibrating the wrong thing.
{
  const { moves } = perMove(positions, APP_K);
  const app = gameAccuracy(appEntries(moves));
  const local = gameAccuracyLocal(appEntries(moves), APP_FLOOR);
  if (app.white !== local.white || app.black !== local.black) {
    console.error("DRIFT: local math disagrees with classify.gameAccuracy", { app, local });
    process.exit(1);
  }
  console.log(`\napp result (k=${APP_K}, floor=${APP_FLOOR}, hopeless<${APP_HOPELESS}):`, app);
}

console.log(`\n${pgnPath} — ${history.length} plies, ${book.isBook.filter(Boolean).length} book`);
if (!Number.isNaN(targetWhite)) {
  console.log(`chess.com target: white ${targetWhite}, black ${targetBlack}`);
}

console.log("\nper-move (app curve k=" + APP_K + "):");
const { moves: appMoves } = perMove(positions, APP_K);
for (let i = 0; i < history.length; i++) {
  const m = history[i];
  const pm = appMoves[i];
  const num = `${Math.floor(i / 2) + 1}${m.color === "w" ? "." : "…"}`;
  console.log(
    `${num.padStart(5)} ${m.san.padEnd(7)} ${pm.entry.excluded ? "book" : `loss ${pm.loss.toFixed(1).padStart(5)}  acc ${pm.entry.acc.toFixed(1).padStart(5)}`}`,
  );
}

const ks = [0.00368208, 0.0045, 0.005, 0.0055, 0.006, 0.007, 0.008, 0.009, 0.01, 0.012];
const floors = [0.1, 5, 10, 15, 20, 25, 30, 35];
// D: moves in positions decided AGAINST the mover (win% < D both before and
// after) are excluded like book moves — shuffling in a lost position
// shouldn't bank accuracy. The winning side keeps credit for converting.
for (const hopelessD of [0, 10, 20, 30]) {
  console.log(
    `\nsweep, hopeless-exclusion D=${hopelessD} (rows: k, cols: harmonic floor) — white / black`,
  );
  console.log("k \\ floor   " + floors.map((f) => String(f).padStart(13)).join(""));
  for (const k of ks) {
    const { moves } = perMove(positions, k);
    const entries = moves.map((m) => ({
      ...m.entry,
      excluded: m.entry.excluded || (hopelessD > 0 && m.hopeless(hopelessD)),
    }));
    const cells = floors.map((floor) => {
      const { white, black } = gameAccuracyLocal(entries, floor);
      return `${white.toFixed(1)} / ${black.toFixed(1)}`.padStart(13);
    });
    console.log(String(k).padEnd(12) + cells.join(""));
  }
}
