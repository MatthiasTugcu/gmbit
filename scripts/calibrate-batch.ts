/**
 * Batch accuracy calibration against chess.com-reported accuracies.
 *
 *   node scripts/calibrate-batch.ts [--workers N] [--eval-only]
 *
 * Reads scripts/fixtures/games.pgn (multi-game PGN) and targets.json
 * (chess.com accuracies in the same order), evaluates every position with
 * the app's engine settings (depth 20, MultiPV 2) using a pool of engine
 * processes, then:
 *   1. self-checks that the local parametric math reproduces the app's
 *      gameAccuracy exactly at the app's parameters,
 *   2. reports baseline error (current classify.ts constants),
 *   3. sweeps k / harmonic floor / hopeless threshold / blend on a train
 *      split and validates on a holdout before recommending changes.
 *
 * Engine results share /tmp/gmbit-eval-cache.json with calibrate.ts, so
 * parameter sweeps re-run instantly once positions are evaluated.
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
import { bookMoves, type BookInfo, type OpeningsMap } from "../src/lib/analysis/openings.ts";
import { parseInfoLine, type AnalysisInfo, type EngineLine } from "../src/lib/engine/index.ts";

const DEPTH = 20;
const MULTI_PV = 2;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_PATH = "/tmp/gmbit-eval-cache.json";

// Must match classify.ts.
const APP_K = 0.005;
const APP_FLOOR = 25;
const APP_HOPELESS = 15;
const APP_BLEND = 0; // weighted-mean share in (weighted, harmonic) blend

const argv = process.argv.slice(2);
const workerCount = Number(argv[argv.indexOf("--workers") + 1]) || 6;
const evalOnly = argv.includes("--eval-only");

// ---------------------------------------------------------------- fixtures

interface Target {
  name: string;
  white: number;
  black: number;
}

interface GameData {
  name: string;
  target: Target;
  history: { color: "w" | "b"; san: string }[];
  fens: string[];
  book: BookInfo;
}

const targets = (
  JSON.parse(readFileSync(join(ROOT, "scripts/fixtures/targets.json"), "utf8")) as {
    games: Target[];
  }
).games;

const pgnText = readFileSync(join(ROOT, "scripts/fixtures/games.pgn"), "utf8");
const pgns = pgnText
  .split(/\n\s*\n(?=\[Event )/)
  .map((s) => s.trim())
  .filter(Boolean);
if (pgns.length !== targets.length) {
  console.error(`games.pgn has ${pgns.length} games but targets.json has ${targets.length}`);
  process.exit(1);
}

const openings = JSON.parse(
  readFileSync(join(ROOT, "src/data/openings.json"), "utf8"),
) as OpeningsMap;

const games: GameData[] = pgns.map((pgn, i) => {
  const chess = new Chess();
  chess.loadPgn(pgn.replace(/\$\d+/g, ""));
  const history = chess
    .history({ verbose: true })
    .map((m) => ({ color: m.color as "w" | "b", san: m.san, before: m.before, after: m.after }));
  const fens = [history[0].before, ...history.map((m) => m.after)];
  return { name: targets[i].name, target: targets[i], history, fens, book: bookMoves(fens, openings) };
});

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

/** Mirror of toPositionEval in src/lib/engine/use-game-analysis.ts. */
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

const cacheKey = (fen: string) => `${fen}|d${DEPTH}|mpv${MULTI_PV}`;

async function evaluateAll(): Promise<Map<string, PositionEval>> {
  const cache: Record<string, AnalysisInfo> = existsSync(CACHE_PATH)
    ? JSON.parse(readFileSync(CACHE_PATH, "utf8"))
    : {};

  const uniqueFens = [...new Set(games.flatMap((g) => g.fens))];
  const missing = uniqueFens.filter((f) => !cache[cacheKey(f)]);
  console.error(
    `${games.length} games, ${uniqueFens.length} unique positions, ${missing.length} to evaluate (depth ${DEPTH}, ${workerCount} workers)`,
  );

  if (missing.length > 0) {
    let next = 0;
    let done = 0;
    let dirty = 0;
    const persist = () => writeFileSync(CACHE_PATH, JSON.stringify(cache));
    const started = Date.now();

    const worker = async () => {
      const engine = await startEngine();
      for (;;) {
        const i = next++;
        if (i >= missing.length) break;
        const fen = missing[i];
        const info = await engine.analyze(fen);
        cache[cacheKey(fen)] = info;
        done++;
        if (++dirty >= 5) {
          dirty = 0;
          persist();
        }
        const rate = done / ((Date.now() - started) / 1000);
        const eta = Math.round((missing.length - done) / Math.max(rate, 0.01));
        process.stderr.write(`\reval ${done}/${missing.length}  (~${eta}s left)   `);
      }
      engine.quit();
    };

    await Promise.all(Array.from({ length: workerCount }, worker));
    persist();
    process.stderr.write("\n");
  }

  return new Map(uniqueFens.map((f) => [f, toPositionEval(f, cache[cacheKey(f)])]));
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
  hopeless: (d: number) => boolean;
}

function perMove(
  game: GameData,
  evals: Map<string, PositionEval>,
  k: number,
): { moves: PerMove[]; winrates: number[] } {
  const positions = game.fens.map((f) => evals.get(f)!);
  const moves: PerMove[] = [];
  const winrates: number[] = [winrate(positions[0].lines[0].score, k)];
  for (let i = 0; i < game.history.length; i++) {
    const color = game.history[i].color;
    const before = positions[i].lines[0].score;
    const after = positions[i + 1].lines[0].score;
    const wBefore = moverWin(color, before, k);
    const wAfter = moverWin(color, after, k);
    const loss = Math.max(0, wBefore - wAfter);
    moves.push({
      entry: { color, acc: moveAccuracy(loss), excluded: game.book.isBook[i] ?? false },
      loss,
      hopeless: (d) => wBefore < d && wAfter < d,
    });
    winrates.push(winrate(after, k));
  }
  return { moves, winrates };
}

function stdDev(xs: number[]): number {
  if (xs.length === 0) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
}

/** Mirror of classify.gameAccuracy with parametric floor and blend. */
function gameAccuracyLocal(
  moves: MoveAccEntry[],
  whiteWinrates: number[],
  floor: number,
  blend: number,
): { white: number; black: number } {
  const windowSize = Math.max(2, Math.min(8, Math.ceil(moves.length / 10)));
  const weights = moves.map((_, i) => {
    const start = Math.max(0, i + 1 - windowSize);
    return Math.max(0.5, Math.min(12, stdDev(whiteWinrates.slice(start, i + 2))));
  });
  const perColor = (color: "w" | "b"): number => {
    const accs: number[] = [];
    const ws: number[] = [];
    moves.forEach((m, i) => {
      if (m.color !== color || m.excluded) return;
      accs.push(m.acc);
      ws.push(weights[i]);
    });
    if (accs.length === 0) return 0;
    const weighted =
      accs.reduce((sum, a, i) => sum + a * ws[i], 0) / ws.reduce((a, b) => a + b, 0);
    const harmonic = accs.length / accs.reduce((sum, a) => sum + 1 / Math.max(a, floor), 0);
    return Math.round((blend * weighted + (1 - blend) * harmonic) * 10) / 10;
  };
  return { white: perColor("w"), black: perColor("b") };
}

interface Params {
  k: number;
  floor: number;
  hopeless: number;
  blend: number;
}

function predict(game: GameData, evals: Map<string, PositionEval>, p: Params) {
  const { moves, winrates } = perMove(game, evals, p.k);
  const entries = moves.map((m) => ({
    ...m.entry,
    excluded: m.entry.excluded || (p.hopeless > 0 && m.hopeless(p.hopeless)),
  }));
  return gameAccuracyLocal(entries, winrates, p.floor, p.blend);
}

interface ErrorStats {
  mae: number;
  bias: number;
  rmse: number;
}

function errors(gs: GameData[], evals: Map<string, PositionEval>, p: Params): ErrorStats {
  const diffs: number[] = [];
  for (const g of gs) {
    const pred = predict(g, evals, p);
    diffs.push(pred.white - g.target.white, pred.black - g.target.black);
  }
  const mae = diffs.reduce((a, d) => a + Math.abs(d), 0) / diffs.length;
  const bias = diffs.reduce((a, d) => a + d, 0) / diffs.length;
  const rmse = Math.sqrt(diffs.reduce((a, d) => a + d * d, 0) / diffs.length);
  return { mae, bias, rmse };
}

function fmtStats(s: ErrorStats): string {
  return `MAE ${s.mae.toFixed(2)}  bias ${s.bias >= 0 ? "+" : ""}${s.bias.toFixed(2)}  RMSE ${s.rmse.toFixed(2)}`;
}

function reportTable(gs: GameData[], evals: Map<string, PositionEval>, p: Params) {
  console.log("  game                        pred W / tgt W    pred B / tgt B     errW   errB");
  for (const g of gs) {
    const pred = predict(g, evals, p);
    const ew = pred.white - g.target.white;
    const eb = pred.black - g.target.black;
    console.log(
      `  ${g.name.padEnd(26)} ${pred.white.toFixed(1).padStart(6)} / ${String(g.target.white).padStart(5)}   ${pred.black
        .toFixed(1)
        .padStart(6)} / ${String(g.target.black).padStart(5)}   ${(ew >= 0 ? "+" : "") + ew.toFixed(1).padStart(5)}  ${(eb >= 0 ? "+" : "") + eb.toFixed(1).padStart(5)}`,
    );
  }
}

// --------------------------------------------------------------------- main

const evals = await evaluateAll();
if (evalOnly) process.exit(0);

// Self-check: local math must reproduce the app's gameAccuracy at app params.
for (const g of games) {
  const { moves, winrates } = perMove(g, evals, APP_K);
  const entries = moves.map((m) => ({
    ...m.entry,
    excluded: m.entry.excluded || m.hopeless(APP_HOPELESS),
  }));
  const app = gameAccuracy(entries);
  const local = gameAccuracyLocal(entries, winrates, APP_FLOOR, APP_BLEND);
  if (app.white !== local.white || app.black !== local.black) {
    console.error(`DRIFT in ${g.name}: app ${JSON.stringify(app)} local ${JSON.stringify(local)}`);
    process.exit(1);
  }
}
console.log("drift check OK — local math matches classify.gameAccuracy on all games\n");

const APP_PARAMS: Params = { k: APP_K, floor: APP_FLOOR, hopeless: APP_HOPELESS, blend: APP_BLEND };

console.log(`=== baseline (k=${APP_K}, floor=${APP_FLOOR}, hopeless=${APP_HOPELESS}, blend=${APP_BLEND}) ===`);
reportTable(games, evals, APP_PARAMS);
console.log(`  overall: ${fmtStats(errors(games, evals, APP_PARAMS))}\n`);

const ks = [0.0035, 0.004, 0.0045, 0.005, 0.0052, 0.0055, 0.0058, 0.006, 0.0065, 0.007, 0.008, 0.009, 0.01, 0.012];
const floors = [0.1, 1, 2.5, 5, 7.5, 10, 15, 20, 25, 30, 35, 40];
const hopelesses = [0, 2.5, 5, 7.5, 10, 15, 20, 25, 30, 35, 40, 45];
const blends = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7];

const combos: Params[] = [];
for (const k of ks)
  for (const hopeless of hopelesses)
    for (const floor of floors)
      for (const blend of blends) combos.push({ k, floor, hopeless, blend });

// Precompute per-combo per-game absolute error (sum over the game's two
// sides), so leave-one-out model selection is a cheap aggregation.
// Memoize the k-dependent per-move data — it's shared by 12 × 9 × 8 combos.
const perMoveMemo = new Map<string, ReturnType<typeof perMove>>();
function perMoveCached(game: GameData, k: number) {
  const key = `${game.name}|${k}`;
  let v = perMoveMemo.get(key);
  if (!v) {
    v = perMove(game, evals, k);
    perMoveMemo.set(key, v);
  }
  return v;
}

const absErr: Float64Array[] = combos.map((p) => {
  const row = new Float64Array(games.length);
  games.forEach((g, gi) => {
    const { moves, winrates } = perMoveCached(g, p.k);
    const entries = moves.map((m) => ({
      ...m.entry,
      excluded: m.entry.excluded || (p.hopeless > 0 && m.hopeless(p.hopeless)),
    }));
    const pred = gameAccuracyLocal(entries, winrates, p.floor, p.blend);
    row[gi] = Math.abs(pred.white - g.target.white) + Math.abs(pred.black - g.target.black);
  });
  return row;
});
const totalAbs = absErr.map((row) => row.reduce((a, b) => a + b, 0));

// Leave-one-out: fit on 19 games, measure on the held-out one. This scores
// the *procedure*, so the estimate is honest even though the final params
// are then fitted on all games.
let looSum = 0;
for (let g = 0; g < games.length; g++) {
  let bestC = 0;
  let bestMae = Infinity;
  for (let c = 0; c < combos.length; c++) {
    const mae = (totalAbs[c] - absErr[c][g]) / (2 * (games.length - 1));
    if (mae < bestMae) {
      bestMae = mae;
      bestC = c;
    }
  }
  looSum += absErr[bestC][g];
}
const looMae = looSum / (2 * games.length);
const baselineMae = errors(games, evals, APP_PARAMS).mae;
console.log("=== leave-one-out validation (procedure-level) ===");
console.log(`  baseline MAE ${baselineMae.toFixed(2)}  |  fitted (LOO) MAE ${looMae.toFixed(2)}\n`);

// Final fit on all games; show the plateau around the optimum.
const order = combos.map((_, c) => c).sort((a, b) => totalAbs[a] - totalAbs[b]);
console.log(`=== fit on all ${games.length} games — top 8 of ${combos.length} combos ===`);
for (const c of order.slice(0, 8)) {
  console.log(`  MAE ${(totalAbs[c] / (2 * games.length)).toFixed(2)}  ${JSON.stringify(combos[c])}`);
}
const best = combos[order[0]];
console.log(`\nfinal params: ${JSON.stringify(best)}`);
reportTable(games, evals, best);
console.log(`  overall: ${fmtStats(errors(games, evals, best))}`);
