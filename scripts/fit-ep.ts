/**
 * Phase 1 spike: does a RATING-aware Expected Points curve predict real game
 * outcomes better than a rating-independent (flat) one?
 *
 *   node scripts/fit-ep.ts [--fixtures dirA,dirB] [--cache path] [--depth D]
 *
 * For every position in the fixture games we have a cached engine eval (cp,
 * side-to-move = the mover) plus the mover's rating and the game's final result.
 * "Expected points" for the mover = their final score (win 1 / draw .5 / loss 0).
 * We fit EP(cp, rating) = 1 / (1 + exp(-k(rating)*cp)),
 *   k(rating) = k0 * exp(k1 * (rating - 1500) / 1000),
 * by grid search, minimizing Brier score against actual outcomes. The flat
 * model is the same fit constrained to k1 = 0. If rating-aware doesn't beat
 * flat, rating-conditioning isn't real and Phases 2-3 are not worth doing.
 */
import { createInterface } from "node:readline";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Chess } from "chess.js";
import { type AnalysisInfo } from "../src/lib/engine/index.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const arg = (name: string, fb: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fb;
};
const DEPTH = Number(arg("--depth", "20"));
const MULTI_PV = 2;
const CACHE_PATH = arg("--cache", "/tmp/gmbit-eval-cache-gm.ndjson");
const FIX = arg("--fixtures", "scripts/fixtures/gm-sample,scripts/fixtures/lowrated-current")
  .split(",")
  .map((d) => join(ROOT, d.trim()));

// ------------------------------------------------------------ load eval cache
// Keyed `fen|d{DEPTH}|mpv{MULTI_PV}` (lite, suffix-free). Read as a stream so
// the 50k-line file never lands in the conversation.
const cacheKey = (fen: string) => `${fen}|d${DEPTH}|mpv${MULTI_PV}`;

async function loadCache(): Promise<Map<string, AnalysisInfo>> {
  const cache = new Map<string, AnalysisInfo>();
  if (!existsSync(CACHE_PATH)) {
    console.error(`cache missing: ${CACHE_PATH}`);
    process.exit(1);
  }
  const rl = createInterface({ input: createReadStream(CACHE_PATH), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    try {
      const { k, v } = JSON.parse(line) as { k: string; v: AnalysisInfo };
      // lite d{DEPTH} only — skip |full and other depths.
      if (k.endsWith(`|d${DEPTH}|mpv${MULTI_PV}`)) cache.set(k, v);
    } catch {
      /* truncated trailing line */
    }
  }
  return cache;
}

/** Mover-perspective centipawns from a cached (side-to-move) eval, mate clamped. */
function moverCp(info: AnalysisInfo): number | null {
  const cp = info.lines?.[0]?.cp ?? info.cp;
  const mate = info.lines?.[0]?.mate ?? info.mate;
  if (mate !== undefined) return mate > 0 ? 1500 : -1500; // mate 0 = mover mated
  if (cp === undefined) return null;
  return Math.max(-1500, Math.min(1500, cp));
}

// -------------------------------------------------------------- build samples

interface Sample {
  cp: number; // mover perspective
  rating: number; // mover's Elo
  points: number; // mover's final game score: 1 / 0.5 / 0
}

interface Meta {
  name: string;
  whiteElo: number;
  blackElo: number;
}

function resultPoints(result: string, white: boolean): number | null {
  if (result === "1-0") return white ? 1 : 0;
  if (result === "0-1") return white ? 0 : 1;
  if (result === "1/2-1/2") return 0.5;
  return null; // unfinished / unknown
}

async function buildSamples(cache: Map<string, AnalysisInfo>): Promise<Sample[]> {
  const samples: Sample[] = [];
  let games = 0;
  let missingEval = 0;
  for (const dir of FIX) {
    if (!existsSync(join(dir, "games.pgn"))) {
      console.error(`skip ${dir} (no games.pgn)`);
      continue;
    }
    const targets = (
      JSON.parse(readFileSync(join(dir, "targets.json"), "utf8")) as { games: { name: string }[] }
    ).games;
    const metaByName = new Map<string, Meta>(
      existsSync(join(dir, "meta.json"))
        ? (JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")) as { games: Meta[] }).games.map(
            (m) => [m.name, m],
          )
        : [],
    );
    const pgns = readFileSync(join(dir, "games.pgn"), "utf8")
      .split(/\n\s*\n(?=\[Event )/)
      .map((s) => s.trim())
      .filter(Boolean);

    pgns.forEach((pgn, i) => {
      const meta = metaByName.get(targets[i]?.name);
      if (!meta || !meta.whiteElo || !meta.blackElo) return;
      const resultMatch = pgn.match(/\[Result\s+"([^"]+)"\]/);
      if (!resultMatch) return;
      const result = resultMatch[1];
      const chess = new Chess();
      try {
        chess.loadPgn(pgn.replace(/\$\d+/g, ""));
      } catch {
        return;
      }
      const hist = chess.history({ verbose: true });
      // fens[j] = position before move j; side to move = the mover.
      const fens = [hist[0]?.before, ...hist.map((m) => m.after)].filter(Boolean) as string[];
      games++;
      for (const fen of fens) {
        const info = cache.get(cacheKey(fen));
        if (!info) {
          missingEval++;
          continue;
        }
        const cp = moverCp(info);
        if (cp === null) continue;
        const whiteToMove = fen.split(" ")[1] === "w";
        const points = resultPoints(result, whiteToMove);
        if (points === null) continue;
        samples.push({ cp, rating: whiteToMove ? meta.whiteElo : meta.blackElo, points });
      }
    });
  }
  console.error(`${games} games, ${samples.length} samples, ${missingEval} positions missing evals`);
  return samples;
}

// --------------------------------------------------------------------- fit

const ep = (cp: number, rating: number, k0: number, k1: number) => {
  const k = k0 * Math.exp((k1 * (rating - 1500)) / 1000);
  return 1 / (1 + Math.exp(-k * cp));
};

const brier = (s: Sample[], k0: number, k1: number) => {
  let sum = 0;
  for (const t of s) {
    const d = ep(t.cp, t.rating, k0, k1) - t.points;
    sum += d * d;
  }
  return sum / s.length;
};

function bandOf(r: number): string {
  if (r < 1200) return "<1200";
  if (r < 1600) return "1200-1600";
  if (r < 2000) return "1600-2000";
  return "2000+";
}

const cache = await loadCache();
const samples = await buildSamples(cache);
if (samples.length === 0) {
  console.error("no samples — aborting");
  process.exit(1);
}

// Coarse grid then a fine pass around the optimum.
const K0S: number[] = [];
for (let v = 0.002; v <= 0.0101; v += 0.00025) K0S.push(Number(v.toFixed(5)));
const K1S: number[] = [];
for (let v = -0.5; v <= 2.001; v += 0.05) K1S.push(Number(v.toFixed(3)));

let bestAware = { k0: 0, k1: 0, b: Infinity };
let bestFlat = { k0: 0, k1: 0, b: Infinity };
for (const k0 of K0S) {
  for (const k1 of K1S) {
    const b = brier(samples, k0, k1);
    if (b < bestAware.b) bestAware = { k0, k1, b };
    if (k1 === 0 && b < bestFlat.b) bestFlat = { k0, k1, b };
  }
}

// Reference Brier: always predict the global mean outcome (no eval/rating info).
const mean = samples.reduce((a, s) => a + s.points, 0) / samples.length;
const brierConst = samples.reduce((a, s) => a + (mean - s.points) ** 2, 0) / samples.length;

const pct = (a: number, b: number) => `${(((b - a) / b) * 100).toFixed(1)}%`;
console.log(`\nsamples: ${samples.length}  (mean outcome ${mean.toFixed(3)})`);
console.log(`Brier — constant(${mean.toFixed(2)}):        ${brierConst.toFixed(5)}`);
console.log(
  `Brier — FLAT  k0=${bestFlat.k0}:            ${bestFlat.b.toFixed(5)}  (${pct(bestFlat.b, brierConst)} better than constant)`,
);
console.log(
  `Brier — RATING-AWARE k0=${bestAware.k0} k1=${bestAware.k1}: ${bestAware.b.toFixed(5)}  (${pct(bestAware.b, bestFlat.b)} better than flat)`,
);
console.log(
  `\nfitted k(rating): k(1000)=${(bestAware.k0 * Math.exp((bestAware.k1 * -500) / 1000)).toFixed(5)}  k(1500)=${bestAware.k0.toFixed(5)}  k(2000)=${(bestAware.k0 * Math.exp((bestAware.k1 * 500) / 1000)).toFixed(5)}`,
);

// Per-band Brier: flat vs rating-aware, to see where (if anywhere) rating helps.
const byBand = new Map<string, Sample[]>();
for (const s of samples) {
  const k = bandOf(s.rating);
  let arr = byBand.get(k);
  if (!arr) byBand.set(k, (arr = []));
  arr.push(s);
}
console.log(`\nper-band Brier (flat vs rating-aware):`);
for (const band of ["<1200", "1200-1600", "1600-2000", "2000+"]) {
  const arr = byBand.get(band);
  if (!arr || arr.length === 0) continue;
  const bf = brier(arr, bestFlat.k0, bestFlat.k1);
  const ba = brier(arr, bestAware.k0, bestAware.k1);
  console.log(
    `  ${band.padEnd(10)} n=${String(arr.length).padStart(6)}  flat ${bf.toFixed(5)}  aware ${ba.toFixed(5)}  (${pct(ba, bf)})`,
  );
}
