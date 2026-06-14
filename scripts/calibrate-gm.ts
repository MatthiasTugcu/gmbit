/**
 * GM-dataset accuracy calibration (segment-aware batch version).
 *
 *   node scripts/calibrate-gm.ts [--workers N] [--depth D] [--fixtures dir]
 *                                [--cache path] [--max-games N]
 *                                [--eval-only] [--fit-only]
 *
 * Like calibrate-batch.ts but for the stratified GM sample: reads
 * games.pgn + targets.json + meta.json from --fixtures (default
 * scripts/fixtures/gm-sample), evaluates positions with an engine pool,
 * then fits k / floor / hopeless / blend with a stratified train/holdout
 * split and reports MAE/bias per rating band and time control plus the
 * worst outliers. Engine results append to an NDJSON cache so interrupted
 * runs resume where they left off.
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Chess } from "chess.js";
import {
  ACCURACY_WON,
  ACCURACY_WON_KEEP,
  decidedForAccuracy,
  gameAccuracy,
  moveAccuracy,
  type MoveAccEntry,
  type PositionEval,
  type Score,
} from "../src/lib/analysis/classify.ts";
import { bookMoves, type BookInfo, type OpeningsMap } from "../src/lib/analysis/openings.ts";
import { parseInfoLine, type AnalysisInfo, type EngineLine } from "../src/lib/engine/index.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const argv = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};
const workerCount = Number(arg("--workers", "6"));
const DEPTH = Number(arg("--depth", "20"));
const MULTI_PV = 2;
const FIXTURES = arg("--fixtures", join(ROOT, "scripts/fixtures/gm-sample"));
const CACHE_PATH = arg("--cache", "/tmp/gmbit-eval-cache-gm.ndjson");
const maxGames = Number(arg("--max-games", "0"));
const reportParams = arg("--report-params", "");
const evalOnly = argv.includes("--eval-only");
const fitOnly = argv.includes("--fit-only");

// Must match classify.ts.
const APP_K = 0.005;
const APP_FLOOR = 25;
const APP_HOPELESS = 15;
const APP_BLEND = 0;

// ---------------------------------------------------------------- fixtures

interface Target {
  name: string;
  white: number;
  black: number;
}

interface Meta {
  name: string;
  whiteElo: number;
  blackElo: number;
  timeControl: string;
  tcClass: string;
  ratingBand: string;
  lengthBucket: string;
  plies: number;
}

interface GameData {
  name: string;
  target: Target;
  meta: Meta;
  history: { color: "w" | "b"; san: string }[];
  fens: string[];
  book: BookInfo;
}

const targets = (
  JSON.parse(readFileSync(join(FIXTURES, "targets.json"), "utf8")) as { games: Target[] }
).games;
const metaByName = new Map<string, Meta>(
  existsSync(join(FIXTURES, "meta.json"))
    ? (JSON.parse(readFileSync(join(FIXTURES, "meta.json"), "utf8")) as { games: Meta[] }).games.map(
        (m) => [m.name, m],
      )
    : [],
);

const pgnText = readFileSync(join(FIXTURES, "games.pgn"), "utf8");
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

let games: GameData[] = pgns.map((pgn, i) => {
  const chess = new Chess();
  chess.loadPgn(pgn.replace(/\$\d+/g, ""));
  const history = chess
    .history({ verbose: true })
    .map((m) => ({ color: m.color as "w" | "b", san: m.san, before: m.before, after: m.after }));
  const fens = [history[0].before, ...history.map((m) => m.after)];
  const meta: Meta = metaByName.get(targets[i].name) ?? {
    name: targets[i].name,
    whiteElo: 0,
    blackElo: 0,
    timeControl: "?",
    tcClass: "unknown",
    ratingBand: "unknown",
    lengthBucket: "unknown",
    plies: history.length,
  };
  return { name: targets[i].name, target: targets[i], meta, history, fens, book: bookMoves(fens, openings) };
});
if (maxGames > 0) games = games.slice(0, maxGames);

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

function loadCache(): Map<string, AnalysisInfo> {
  const cache = new Map<string, AnalysisInfo>();
  if (!existsSync(CACHE_PATH)) return cache;
  for (const line of readFileSync(CACHE_PATH, "utf8").split("\n")) {
    if (!line) continue;
    try {
      const { k, v } = JSON.parse(line) as { k: string; v: AnalysisInfo };
      cache.set(k, v);
    } catch {
      // Truncated trailing line from an interrupted run — drop it.
    }
  }
  return cache;
}

async function evaluateAll(): Promise<Map<string, PositionEval>> {
  const cache = loadCache();
  const uniqueFens = [...new Set(games.flatMap((g) => g.fens))];
  const missing = uniqueFens.filter((f) => !cache.has(cacheKey(f)));
  console.error(
    `${games.length} games, ${uniqueFens.length} unique positions, ${missing.length} to evaluate (depth ${DEPTH}, ${workerCount} workers)`,
  );
  if (fitOnly && missing.length > 0) {
    console.error(`--fit-only but ${missing.length} positions missing from cache`);
    process.exit(1);
  }

  if (missing.length > 0 && !fitOnly) {
    let next = 0;
    let done = 0;
    const started = Date.now();

    const worker = async () => {
      const engine = await startEngine();
      for (;;) {
        const i = next++;
        if (i >= missing.length) break;
        const fen = missing[i];
        const info = await engine.analyze(fen);
        const key = cacheKey(fen);
        cache.set(key, info);
        appendFileSync(CACHE_PATH, JSON.stringify({ k: key, v: info }) + "\n");
        done++;
        if (done % 25 === 0 || done === missing.length) {
          const rate = done / ((Date.now() - started) / 1000);
          const etaMin = Math.round((missing.length - done) / Math.max(rate, 0.001) / 60);
          process.stderr.write(
            `eval ${done}/${missing.length}  (${rate.toFixed(2)}/s, ~${etaMin} min left)\n`,
          );
        }
      }
      engine.quit();
    };

    await Promise.all(Array.from({ length: workerCount }, worker));
  }

  return new Map(uniqueFens.map((f) => [f, toPositionEval(f, cache.get(cacheKey(f))!)]));
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

function stdDev(xs: number[]): number {
  if (xs.length === 0) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
}

/**
 * Per-(game, k) data flattened for the sweep: accuracies, volatility
 * weights (computed over all moves, matching classify.gameAccuracy), book
 * flags and mover win% before/after for hopeless exclusion.
 */
interface GameK {
  isWhite: Uint8Array;
  book: Uint8Array;
  acc: Float64Array;
  weight: Float64Array;
  wBefore: Float64Array;
  wAfter: Float64Array;
}

function buildGameK(game: GameData, evals: Map<string, PositionEval>, k: number): GameK {
  const n = game.history.length;
  const positions = game.fens.map((f) => evals.get(f)!);
  const isWhite = new Uint8Array(n);
  const book = new Uint8Array(n);
  const acc = new Float64Array(n);
  const wBefore = new Float64Array(n);
  const wAfter = new Float64Array(n);
  const whiteWinrates: number[] = [winrate(positions[0].lines[0].score, k)];
  for (let i = 0; i < n; i++) {
    const color = game.history[i].color;
    const before = positions[i].lines[0].score;
    const after = positions[i + 1].lines[0].score;
    isWhite[i] = color === "w" ? 1 : 0;
    book[i] = game.book.isBook[i] ? 1 : 0;
    wBefore[i] = moverWin(color, before, k);
    wAfter[i] = moverWin(color, after, k);
    acc[i] = moveAccuracy(Math.max(0, wBefore[i] - wAfter[i]));
    whiteWinrates.push(winrate(after, k));
  }
  const windowSize = Math.max(2, Math.min(8, Math.ceil(n / 10)));
  const weight = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i + 1 - windowSize);
    weight[i] = Math.max(0.5, Math.min(12, stdDev(whiteWinrates.slice(start, i + 2))));
  }
  return { isWhite, book, acc, weight, wBefore, wAfter };
}

interface Params {
  k: number;
  floor: number;
  hopeless: number;
  blend: number;
}

/** Same math as classify.gameAccuracy generalized to parametric floor/blend. */
function predictFromGameK(g: GameK, p: Params): { white: number; black: number } {
  const perColor = (white: 0 | 1): number => {
    let wNum = 0;
    let wDen = 0;
    let hDen = 0;
    let count = 0;
    for (let i = 0; i < g.acc.length; i++) {
      if (g.isWhite[i] !== white) continue;
      if (g.book[i]) continue;
      if (p.hopeless > 0 && g.wBefore[i] < p.hopeless && g.wAfter[i] < p.hopeless) continue;
      // Mirror classify.decidedForAccuracy: a kept, already-won position is excluded too.
      if (g.wBefore[i] >= ACCURACY_WON && g.wAfter[i] >= ACCURACY_WON_KEEP) continue;
      wNum += g.acc[i] * g.weight[i];
      wDen += g.weight[i];
      hDen += 1 / Math.max(g.acc[i], p.floor);
      count++;
    }
    if (count === 0) return 0;
    const weighted = wNum / wDen;
    const harmonic = count / hDen;
    return Math.round((p.blend * weighted + (1 - p.blend) * harmonic) * 10) / 10;
  };
  return { white: perColor(1), black: perColor(0) };
}

const gameKMemo = new Map<string, GameK>();
// `evals` is initialized in main before the first gameK call.
function gameK(game: GameData, gi: number, k: number): GameK {
  const key = `${gi}|${k}`;
  let v = gameKMemo.get(key);
  if (!v) {
    v = buildGameK(game, evals, k);
    gameKMemo.set(key, v);
  }
  return v;
}

function predict(game: GameData, gi: number, p: Params) {
  return predictFromGameK(gameK(game, gi, p.k), p);
}

// ----------------------------------------------------------------- reporting

interface ErrorStats {
  mae: number;
  bias: number;
  rmse: number;
  n: number;
}

function statsOf(diffs: number[]): ErrorStats {
  const mae = diffs.reduce((a, d) => a + Math.abs(d), 0) / diffs.length;
  const bias = diffs.reduce((a, d) => a + d, 0) / diffs.length;
  const rmse = Math.sqrt(diffs.reduce((a, d) => a + d * d, 0) / diffs.length);
  return { mae, bias, rmse, n: diffs.length };
}

function fmtStats(s: ErrorStats): string {
  return `MAE ${s.mae.toFixed(2)}  bias ${s.bias >= 0 ? "+" : ""}${s.bias.toFixed(2)}  RMSE ${s.rmse.toFixed(2)}  (n=${s.n})`;
}

function gameIndex(g: GameData): number {
  return games.indexOf(g);
}

function segmentReport(gs: GameData[], p: Params, label: string) {
  const bySeg = new Map<string, number[]>();
  const all: number[] = [];
  for (const g of gs) {
    const pred = predict(g, gameIndex(g), p);
    const dw = pred.white - g.target.white;
    const db = pred.black - g.target.black;
    all.push(dw, db);
    for (const seg of [`band ${g.meta.ratingBand}`, `tc   ${g.meta.tcClass}`, `len  ${g.meta.lengthBucket}`]) {
      let arr = bySeg.get(seg);
      if (!arr) bySeg.set(seg, (arr = []));
      arr.push(dw, db);
    }
  }
  console.log(`${label}: ${fmtStats(statsOf(all))}`);
  for (const [seg, diffs] of [...bySeg.entries()].sort()) {
    console.log(`    ${seg.padEnd(16)} ${fmtStats(statsOf(diffs))}`);
  }
}

// --------------------------------------------------------------------- main

const evals = await evaluateAll();
if (evalOnly) process.exit(0);

// Self-check: local math must reproduce the app's gameAccuracy at app params.
for (let gi = 0; gi < games.length; gi++) {
  const g = games[gi];
  const gk = gameK(g, gi, APP_K);
  const entries: MoveAccEntry[] = [];
  for (let i = 0; i < gk.acc.length; i++) {
    entries.push({
      color: gk.isWhite[i] ? "w" : "b",
      acc: gk.acc[i],
      excluded: gk.book[i] === 1 || decidedForAccuracy(gk.wBefore[i], gk.wAfter[i]),
    });
  }
  const app = gameAccuracy(entries);
  const local = predictFromGameK(gk, {
    k: APP_K,
    floor: APP_FLOOR,
    hopeless: APP_HOPELESS,
    blend: APP_BLEND,
  });
  if (app.white !== local.white || app.black !== local.black) {
    console.error(`DRIFT in ${g.name}: app ${JSON.stringify(app)} local ${JSON.stringify(local)}`);
    process.exit(1);
  }
}
console.log("drift check OK — local math matches classify.gameAccuracy on all games\n");

const APP_PARAMS: Params = { k: APP_K, floor: APP_FLOOR, hopeless: APP_HOPELESS, blend: APP_BLEND };

console.log(`=== baseline (k=${APP_K}, floor=${APP_FLOOR}, hopeless=${APP_HOPELESS}, blend=${APP_BLEND}) ===`);
segmentReport(games, APP_PARAMS, "  baseline, all games");
console.log();

if (reportParams) {
  const p = JSON.parse(reportParams) as Params;
  console.log(`=== requested params ${reportParams} ===`);
  segmentReport(games, p, "  requested params, all games");
  process.exit(0);
}

const ks = [0.0035, 0.004, 0.0045, 0.005, 0.0055, 0.006, 0.0065, 0.007, 0.008, 0.009, 0.01, 0.012];
const floors = [0.1, 1, 2.5, 5, 7.5, 10, 15, 20, 25, 30, 40];
const hopelesses = [0, 2.5, 5, 7.5, 10, 15, 20, 25, 30, 40];
const blends = [0, 0.15, 0.3, 0.45, 0.6, 0.75];

const combos: Params[] = [];
for (const k of ks)
  for (const hopeless of hopelesses)
    for (const floor of floors)
      for (const blend of blends) combos.push({ k, floor, hopeless, blend });

console.log(`sweeping ${combos.length} combos over ${games.length} games...`);

// Per-combo per-game absolute error (sum of both sides).
const absErr: Float64Array[] = combos.map((p) => {
  const row = new Float64Array(games.length);
  for (let gi = 0; gi < games.length; gi++) {
    const pred = predictFromGameK(gameK(games[gi], gi, p.k), p);
    row[gi] =
      Math.abs(pred.white - games[gi].target.white) + Math.abs(pred.black - games[gi].target.black);
  }
  return row;
});

// Stratified train/holdout split (deterministic): every 4th game per stratum
// goes to the holdout.
const byStratum = new Map<string, number[]>();
games.forEach((g, gi) => {
  const key = `${g.meta.ratingBand}|${g.meta.tcClass}|${g.meta.lengthBucket}`;
  let arr = byStratum.get(key);
  if (!arr) byStratum.set(key, (arr = []));
  arr.push(gi);
});
const trainIdx: number[] = [];
const holdIdx: number[] = [];
for (const arr of byStratum.values()) {
  arr.forEach((gi, i) => (i % 4 === 3 ? holdIdx : trainIdx).push(gi));
}

const maeOver = (c: number, idx: number[]) =>
  idx.reduce((a, gi) => a + absErr[c][gi], 0) / (2 * idx.length);

let bestTrainC = 0;
for (let c = 1; c < combos.length; c++) {
  if (maeOver(c, trainIdx) < maeOver(bestTrainC, trainIdx)) bestTrainC = c;
}
const trainGames = trainIdx.map((gi) => games[gi]);
const holdGames = holdIdx.map((gi) => games[gi]);
console.log(`\n=== train/holdout validation (${trainIdx.length}/${holdIdx.length} games) ===`);
console.log(`  params fitted on train: ${JSON.stringify(combos[bestTrainC])}`);
console.log(`  train MAE ${maeOver(bestTrainC, trainIdx).toFixed(2)}  |  holdout MAE ${maeOver(bestTrainC, holdIdx).toFixed(2)}  |  holdout baseline MAE ${holdGames.length ? statsOf(holdGames.flatMap((g) => { const pred = predict(g, gameIndex(g), APP_PARAMS); return [pred.white - g.target.white, pred.black - g.target.black]; })).mae.toFixed(2) : "?"}`);
segmentReport(holdGames, combos[bestTrainC], "  fitted params on holdout");
void trainGames;

// Final fit on all games; show the plateau around the optimum.
const totalAbs = absErr.map((row) => row.reduce((a, b) => a + b, 0));
const order = combos.map((_, c) => c).sort((a, b) => totalAbs[a] - totalAbs[b]);
console.log(`\n=== fit on all ${games.length} games — top 8 of ${combos.length} combos ===`);
for (const c of order.slice(0, 8)) {
  console.log(`  MAE ${(totalAbs[c] / (2 * games.length)).toFixed(2)}  ${JSON.stringify(combos[c])}`);
}
const best = combos[order[0]];
console.log(`\nfinal params: ${JSON.stringify(best)}`);
segmentReport(games, best, "  final params, all games");

// Worst outliers at final params.
const finalC = order[0];
const worst = games
  .map((g, gi) => ({ g, err: absErr[finalC][gi] / 2 }))
  .sort((a, b) => b.err - a.err)
  .slice(0, 10);
console.log("\n=== 10 worst outliers at final params ===");
for (const { g, err } of worst) {
  const pred = predict(g, gameIndex(g), best);
  console.log(
    `  ${g.name.padEnd(14)} ${g.meta.ratingBand.padEnd(10)} ${g.meta.tcClass.padEnd(9)} ${g.meta.timeControl.padEnd(8)} ${String(g.meta.plies).padStart(3)} plies  pred ${pred.white.toFixed(1)}/${pred.black.toFixed(1)}  tgt ${g.target.white}/${g.target.black}  avg|err| ${err.toFixed(1)}`,
  );
}
