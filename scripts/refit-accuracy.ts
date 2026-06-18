/**
 * Joint refit of the accuracy formula against chess.com-reported accuracies.
 *
 *   node scripts/refit-accuracy.ts [--fixtures dir] [--cache path] [--depth D]
 *
 * Reuses an already-warm eval cache (run calibrate-gm.ts --eval-only first) and
 * fits SIX free parameters that the shipped pipeline holds fixed or inherited:
 *
 *   k      win% logistic steepness            (shipped 0.005)
 *   a,b,c  per-move curve  acc = a·e^(-b·loss) + c, clamped [0,100]
 *                                              (shipped 103.1668 / 0.04354 / -3.1669,
 *                                               inherited from lichess, never refit)
 *   p      power-mean exponent over per-move accuracies; p=-1 is the shipped
 *          harmonic mean, p=1 arithmetic                       (shipped -1)
 *   floor  per-move accuracy floor inside the mean             (shipped 25)
 *
 * Exclusions (book / hopeless / won) are kept at shipped values — this isolates
 * levers 1 (curve) and 2 (aggregation). Optimises pooled mean-abs-error on a
 * stratified train split via Nelder–Mead with restarts; reports holdout MAE and
 * per-band breakdown vs the shipped baseline.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Chess } from "chess.js";
import { ACCURACY_WON, ACCURACY_WON_KEEP, type PositionEval, type Score } from "../src/lib/analysis/classify.ts";
import { bookMoves, type BookInfo, type OpeningsMap } from "../src/lib/analysis/openings.ts";
import type { AnalysisInfo } from "../src/lib/engine/index.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const arg = (n: string, d: string) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : d;
};
const FIXTURES = arg("--fixtures", join(ROOT, "scripts/fixtures/midelo-current"));
const CACHE_PATH = arg("--cache", "/tmp/gmbit-eval-cache-midelo.ndjson");
const DEPTH = Number(arg("--depth", "20"));
const MULTI_PV = 2;
const HOPELESS = 15; // shipped ACCURACY_HOPELESS

// Currently-shipped constants in classify.ts (the baseline to beat).
const SHIPPED = { k: 0.00207, a: 104.13, b: 0.1329, c: -2.01, p: 0.305, floor: 8.7 };

// ----------------------------------------------------------------- fixtures
interface Target { name: string; white: number; black: number }
interface Meta { name: string; ratingBand: string; tcClass: string; lengthBucket: string }
interface MoveRaw { white: 0 | 1; book: 0 | 1; before: Score; after: Score }
interface Game { name: string; target: Target; band: string; tc: string; len: string; moves: MoveRaw[] }

const targets = (JSON.parse(readFileSync(join(FIXTURES, "targets.json"), "utf8")) as { games: Target[] }).games;
const metaByName = new Map<string, Meta>(
  (JSON.parse(readFileSync(join(FIXTURES, "meta.json"), "utf8")) as { games: Meta[] }).games.map((m) => [m.name, m]),
);
const pgns = readFileSync(join(FIXTURES, "games.pgn"), "utf8")
  .split(/\n\s*\n(?=\[Event )/).map((s) => s.trim()).filter(Boolean);
const openings = JSON.parse(readFileSync(join(ROOT, "src/data/openings.json"), "utf8")) as OpeningsMap;

// ------------------------------------------------------------------- cache
const cacheKey = (fen: string) => `${fen}|d${DEPTH}|mpv${MULTI_PV}`;
function loadCache(): Map<string, AnalysisInfo> {
  const cache = new Map<string, AnalysisInfo>();
  if (!existsSync(CACHE_PATH)) return cache;
  for (const line of readFileSync(CACHE_PATH, "utf8").split("\n")) {
    if (!line) continue;
    try { const { k, v } = JSON.parse(line) as { k: string; v: AnalysisInfo }; cache.set(k, v); } catch { /* truncated */ }
  }
  return cache;
}
function toPositionEval(fen: string, info: AnalysisInfo): PositionEval {
  const sign = fen.split(" ")[1] === "b" ? -1 : 1;
  const raw = info.lines && info.lines.length > 0 ? info.lines : [{ cp: info.cp, mate: info.mate, pv: info.pv }];
  return { lines: raw.map((l) => ({ score: { cp: l.cp !== undefined ? l.cp * sign : undefined, mate: l.mate !== undefined ? (l.mate === 0 ? -sign : l.mate * sign) : undefined }, uci: l.pv[0] })) };
}

const cache = loadCache();
const games: Game[] = [];
let missing = 0;
pgns.forEach((pgn, gi) => {
  const chess = new Chess();
  chess.loadPgn(pgn.replace(/\$\d+/g, ""));
  const hist = chess.history({ verbose: true }).map((m) => ({ color: m.color as "w" | "b", before: m.before, after: m.after }));
  if (hist.length === 0) return;
  const fens = [hist[0].before, ...hist.map((m) => m.after)];
  const book: BookInfo = bookMoves(fens, openings);
  const pos = fens.map((f) => { const info = cache.get(cacheKey(f)); if (!info) { missing++; return null; } return toPositionEval(f, info); });
  if (pos.some((p) => p === null)) return;
  const moves: MoveRaw[] = hist.map((h, i) => ({
    white: h.color === "w" ? 1 : 0,
    book: book.isBook[i] ? 1 : 0,
    before: pos[i]!.lines[0].score,   // best line before the move
    after: pos[i + 1]!.lines[0].score, // eval after the move played
  }));
  const meta = metaByName.get(targets[gi].name);
  games.push({ name: targets[gi].name, target: targets[gi], band: meta?.ratingBand ?? "?", tc: meta?.tcClass ?? "?", len: meta?.lengthBucket ?? "?", moves });
});
if (missing > 0) { console.error(`cache cold: ${missing} positions missing — run calibrate-gm.ts --eval-only first`); process.exit(1); }
console.log(`loaded ${games.length} games from warm cache\n`);

// ------------------------------------------------------------ accuracy math
function winrate(s: Score, k: number): number {
  if (s.mate !== undefined) return s.mate > 0 ? 100 : 0;
  if (s.cp === undefined) return 50;
  const c = Math.max(-1500, Math.min(1500, s.cp));
  return 50 + 50 * (2 / (1 + Math.exp(-k * c)) - 1);
}
const moverWin = (white: 0 | 1, s: Score, k: number) => (white ? winrate(s, k) : 100 - winrate(s, k));

type P = { k: number; a: number; b: number; c: number; p: number; floor: number };
const accFn = (loss: number, p: P) => Math.max(0, Math.min(100, p.a * Math.exp(-p.b * Math.max(0, loss)) + p.c));

/** Generalised power mean with a floor; p→0 is geometric, p=-1 harmonic. */
function powerMean(vals: number[], p: P): number {
  if (vals.length === 0) return 0;
  const v = vals.map((x) => Math.max(x, p.floor));
  if (Math.abs(p.p) < 1e-6) return Math.exp(v.reduce((a, x) => a + Math.log(x), 0) / v.length);
  const m = v.reduce((a, x) => a + Math.pow(x, p.p), 0) / v.length;
  return Math.pow(m, 1 / p.p);
}

/** Predicted white/black accuracy (unrounded) for one game. */
function predict(g: Game, p: P): { white: number; black: number } {
  const per = (white: 0 | 1) => {
    const accs: number[] = [];
    for (const m of g.moves) {
      if (m.white !== white || m.book) continue;
      const wb = moverWin(white, m.before, p.k);
      const wa = moverWin(white, m.after, p.k);
      if (wb < HOPELESS && wa < HOPELESS) continue;
      if (wb >= ACCURACY_WON && wa >= ACCURACY_WON_KEEP) continue;
      accs.push(accFn(wb - wa, p));
    }
    return powerMean(accs, p);
  };
  return { white: per(1), black: per(0) };
}

// ------------------------------------------------- stratified train/holdout
const byStratum = new Map<string, number[]>();
games.forEach((g, gi) => {
  const key = `${g.band}|${g.tc}|${g.len}`;
  (byStratum.get(key) ?? byStratum.set(key, []).get(key)!).push(gi);
});
const trainIdx: number[] = [], holdIdx: number[] = [];
for (const arr of byStratum.values()) arr.forEach((gi, i) => (i % 4 === 3 ? holdIdx : trainIdx).push(gi));

const maeOn = (idx: number[], p: P) => {
  let s = 0;
  for (const gi of idx) { const pr = predict(games[gi], p); s += Math.abs(pr.white - games[gi].target.white) + Math.abs(pr.black - games[gi].target.black); }
  return s / (2 * idx.length);
};

// --balanced: weight each rating band equally (macro-average of per-band MAE)
// instead of per-game (micro). Stops populous bands dominating the fit.
const BALANCED = argv.includes("--balanced");
const bandsOf = (idx: number[]) => {
  const m = new Map<string, number[]>();
  for (const gi of idx) (m.get(games[gi].band) ?? m.set(games[gi].band, []).get(games[gi].band)!).push(gi);
  return [...m.values()];
};
const objOn = (idx: number[], p: P) =>
  BALANCED ? bandsOf(idx).reduce((a, b) => a + maeOn(b, p), 0) / bandsOf(idx).length : maeOn(idx, p);

// --------------------------------------------------------- Nelder–Mead
const BOUNDS: [number, number][] = [[0.0015, 0.02], [50, 160], [0.01, 0.18], [-40, 15], [-4, 1], [1, 50]];
const toP = (x: number[]): P => ({ k: x[0], a: x[1], b: x[2], c: x[3], p: x[4], floor: x[5] });
const clampVec = (x: number[]) => x.map((v, i) => Math.max(BOUNDS[i][0], Math.min(BOUNDS[i][1], v)));

function nelderMead(f: (x: number[]) => number, x0: number[], iters = 400): { x: number[]; fx: number } {
  const n = x0.length;
  const step = [0.001, 12, 0.012, 6, 0.6, 8];
  let simplex = [x0, ...Array.from({ length: n }, (_, i) => x0.map((v, j) => (j === i ? v + step[i] : v)))].map(clampVec);
  let fval = simplex.map((s) => f(s));
  const order = () => { const idx = fval.map((_, i) => i).sort((a, b) => fval[a] - fval[b]); simplex = idx.map((i) => simplex[i]); fval = idx.map((i) => fval[i]); };
  for (let it = 0; it < iters; it++) {
    order();
    const centroid = Array.from({ length: n }, (_, j) => simplex.slice(0, n).reduce((a, s) => a + s[j], 0) / n);
    const worst = simplex[n], fWorst = fval[n];
    const refl = clampVec(centroid.map((c, j) => c + 1 * (c - worst[j]))); const fR = f(refl);
    if (fR < fval[0]) {
      const exp = clampVec(centroid.map((c, j) => c + 2 * (c - worst[j]))); const fE = f(exp);
      if (fE < fR) { simplex[n] = exp; fval[n] = fE; } else { simplex[n] = refl; fval[n] = fR; }
    } else if (fR < fval[n - 1]) { simplex[n] = refl; fval[n] = fR; }
    else {
      const con = clampVec(centroid.map((c, j) => c + 0.5 * (worst[j] - c))); const fC = f(con);
      if (fC < fWorst) { simplex[n] = con; fval[n] = fC; }
      else { for (let i = 1; i <= n; i++) { simplex[i] = clampVec(simplex[i].map((v, j) => simplex[0][j] + 0.5 * (v - simplex[0][j]))); fval[i] = f(simplex[i]); } }
    }
  }
  order();
  return { x: simplex[0], fx: fval[0] };
}

// --------------------------------------------------------------------- run
// --lock-k: pin k at the shipped 0.005 so classification thresholds (which
// share ACCURACY_WIN_K) are untouched; only a,b,c,p,floor move.
const LOCK_K = argv.includes("--lock-k");
if (LOCK_K) BOUNDS[0] = [SHIPPED.k, SHIPPED.k];
const objective = (x: number[]) => objOn(trainIdx, toP(x));
const shippedVec = [SHIPPED.k, SHIPPED.a, SHIPPED.b, SHIPPED.c, SHIPPED.p, SHIPPED.floor];
const fmt = (p: P) => `k=${p.k.toFixed(4)} a=${p.a.toFixed(2)} b=${p.b.toFixed(4)} c=${p.c.toFixed(2)} p=${p.p.toFixed(2)} floor=${p.floor.toFixed(1)}`;
const shipP = toP(shippedVec);
const allIdx = games.map((_, i) => i);
const bands = [...new Set(games.map((g) => g.band))].sort();
function perBand(label: string, a: P, b: P, aName: string, bName: string) {
  console.log(`=== per-band MAE (${label}) ===`);
  console.log(`  band        ${aName.padStart(6)}  ${bName.padStart(6)}`);
  for (const band of bands) {
    const idx = games.map((g, i) => (g.band === band ? i : -1)).filter((i) => i >= 0);
    console.log(`  ${band.padEnd(11)} ${maeOn(idx, a).toFixed(2).padStart(6)}  ${maeOn(idx, b).toFixed(2).padStart(6)}   (n=${idx.length})`);
  }
}

// --apply '<json>': don't fit — just score given params (cross-set validation).
const APPLY = arg("--apply", "");
if (APPLY) {
  const ap = JSON.parse(APPLY) as P;
  console.log(`fixture ${FIXTURES.split("/").pop()} — ${games.length} games\n`);
  console.log(`shipped   ${fmt(shipP)}\n  all MAE ${maeOn(allIdx, shipP).toFixed(2)}`);
  console.log(`applied   ${fmt(ap)}\n  all MAE ${maeOn(allIdx, ap).toFixed(2)}\n`);
  perBand("all games", shipP, ap, "shipped", "applied");
  process.exit(0);
}

const starts: number[][] = [
  shippedVec,
  [0.006, 100, 0.05, -2, -1, 20],
  [0.008, 90, 0.06, 0, -0.5, 10],
  [0.004, 110, 0.04, -5, -1.5, 30],
  [0.007, 95, 0.055, -1, 0, 5],
];
let best = { x: shippedVec, fx: objective(shippedVec) };
for (const s of starts) { const r = nelderMead(objective, clampVec(s)); if (r.fx < best.fx) best = r; }
const fit = toP(best.x);

console.log("=== shipped baseline ===");
console.log(`  ${fmt(shipP)}`);
console.log(`  train MAE ${maeOn(trainIdx, shipP).toFixed(2)}   holdout MAE ${maeOn(holdIdx, shipP).toFixed(2)}   all MAE ${maeOn(allIdx, shipP).toFixed(2)}\n`);

console.log("=== refit ===");
console.log(`  ${fmt(fit)}`);
console.log(`  train MAE ${maeOn(trainIdx, fit).toFixed(2)}   holdout MAE ${maeOn(holdIdx, fit).toFixed(2)}   all MAE ${maeOn(allIdx, fit).toFixed(2)}`);
console.log(`  params: ${JSON.stringify({ k: +fit.k.toFixed(5), a: +fit.a.toFixed(2), b: +fit.b.toFixed(4), c: +fit.c.toFixed(2), p: +fit.p.toFixed(3), floor: +fit.floor.toFixed(1) })}\n`);

perBand("all games", shipP, fit, "shipped", "refit");
