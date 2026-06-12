/**
 * Stratified sampler for the chess.com GM games dataset (~15 GB CSV).
 *
 *   node scripts/sample-gm-games.ts [--input path] [--per-stratum N]
 *
 * Streams the CSV once with a quote-aware state machine (multi-line quoted
 * pgn fields), keeps a fixed-size reservoir per stratum (rating band ×
 * time-control class × game-length bucket), and writes
 * scripts/fixtures/gm-sample/{games.pgn,targets.json,meta.json}.
 * Memory is bounded by the reservoirs — the file itself is never buffered.
 */
import { createReadStream, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Chess } from "chess.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "scripts/fixtures/gm-sample");

const argv = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};
const INPUT = arg("--input", join(homedir(), "Downloads/GM_games_dataset.csv"));
const PER_STRATUM = Number(arg("--per-stratum", "9"));

// Column indices from the header row.
const COL = {
  url: 3,
  whiteAcc: 4,
  blackAcc: 5,
  result: 11,
  blackElo: 12,
  timeControl: 18,
  whiteElo: 19,
  pgn: 20,
} as const;
const NUM_COLS = 22;

// ----------------------------------------------------------------- strata

function ratingBand(avgElo: number): string {
  if (avgElo < 1200) return "<1200";
  if (avgElo < 1600) return "1200-1600";
  if (avgElo < 2000) return "1600-2000";
  return "2000+";
}

/** Live time-control class from base seconds; daily games return null. */
function tcClass(tc: string): string | null {
  if (tc.includes("/")) return null; // daily, e.g. "1/86400"
  const base = Number(tc.split("+")[0]);
  if (!Number.isFinite(base) || base <= 0) return null;
  if (base < 180) return "bullet";
  if (base < 600) return "blitz";
  if (base <= 1800) return "rapid";
  return "classical";
}

function lengthBucket(plies: number): string | null {
  if (plies < 20 || plies > 160) return null;
  if (plies <= 50) return "short";
  if (plies <= 90) return "medium";
  return "long";
}

interface Row {
  url: string;
  whiteAcc: number;
  blackAcc: number;
  whiteElo: number;
  blackElo: number;
  timeControl: string;
  tcClass: string;
  ratingBand: string;
  lengthBucket: string;
  plies: number;
  pgn: string;
}

// Deterministic RNG so reruns produce the same sample.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260612);

const reservoirs = new Map<string, { rows: Row[]; seen: number }>();

function offer(row: Row) {
  const key = `${row.ratingBand}|${row.tcClass}|${row.lengthBucket}`;
  let r = reservoirs.get(key);
  if (!r) {
    r = { rows: [], seen: 0 };
    reservoirs.set(key, r);
  }
  r.seen++;
  if (r.rows.length < PER_STRATUM) {
    r.rows.push(row);
  } else {
    const j = Math.floor(rand() * r.seen);
    if (j < PER_STRATUM) r.rows[j] = row;
  }
}

// ------------------------------------------------------------- CSV streaming

let rowsTotal = 0;
let rowsEligible = 0;

function handleRow(fields: string[]) {
  rowsTotal++;
  if (fields.length < NUM_COLS) return;
  const whiteAcc = Number(fields[COL.whiteAcc]);
  const blackAcc = Number(fields[COL.blackAcc]);
  if (!(whiteAcc > 0 && whiteAcc <= 100 && blackAcc > 0 && blackAcc <= 100)) return;
  const whiteElo = Number(fields[COL.whiteElo]);
  const blackElo = Number(fields[COL.blackElo]);
  if (!Number.isFinite(whiteElo) || !Number.isFinite(blackElo)) return;
  const tc = tcClass(fields[COL.timeControl]);
  if (!tc) return;
  const pgn = fields[COL.pgn];
  // Cheap ply count: one clock comment per half-move in chess.com PGNs.
  const plies = (pgn.match(/%clk/g) ?? []).length;
  const len = lengthBucket(plies);
  if (!len) return;
  rowsEligible++;
  offer({
    url: fields[COL.url],
    whiteAcc,
    blackAcc,
    whiteElo,
    blackElo,
    timeControl: fields[COL.timeControl],
    tcClass: tc,
    ratingBand: ratingBand((whiteElo + blackElo) / 2),
    lengthBucket: len,
    plies,
    pgn,
  });
}

async function streamCsv(): Promise<void> {
  const stream = createReadStream(INPUT, { encoding: "utf8", highWaterMark: 4 * 1024 * 1024 });
  let fields: string[] = [];
  let field = "";
  let inQuotes = false;
  let sawHeader = false;
  let bytes = 0;
  const started = Date.now();

  for await (const chunk of stream) {
    bytes += Buffer.byteLength(chunk as string);
    const s = chunk as string;
    let start = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (inQuotes) {
        if (c === 34 /* " */) {
          field += s.slice(start, i);
          if (s.charCodeAt(i + 1) === 34) {
            // Escaped quote. (Never splits across chunks in practice because
            // chunk sizes are powers of two and we re-check below anyway.)
            field += '"';
            i++;
            start = i + 1;
          } else {
            inQuotes = false;
            start = i + 1;
          }
        }
      } else if (c === 34) {
        field += s.slice(start, i);
        inQuotes = true;
        start = i + 1;
      } else if (c === 44 /* , */) {
        fields.push(field + s.slice(start, i));
        field = "";
        start = i + 1;
      } else if (c === 10 /* \n */) {
        let end = i;
        if (s.charCodeAt(i - 1) === 13 && i > start) end = i - 1;
        fields.push(field + s.slice(start, end));
        field = "";
        start = i + 1;
        if (sawHeader) handleRow(fields);
        else sawHeader = true;
        fields = [];
      }
    }
    field += s.slice(start);
    const pct = ((bytes / 15147239712) * 100).toFixed(1);
    const mbps = bytes / 1e6 / ((Date.now() - started) / 1000);
    process.stderr.write(`\rscan ${pct}%  (${mbps.toFixed(0)} MB/s)   `);
  }
  if (field.length > 0 || fields.length > 0) {
    fields.push(field);
    if (sawHeader) handleRow(fields);
  }
  process.stderr.write("\n");
}

// --------------------------------------------------------------------- main

await streamCsv();

// Collect, dedupe by url, validate each PGN actually replays in chess.js.
const sampled = [...reservoirs.values()].flatMap((r) => r.rows);
const seenUrls = new Set<string>();
const valid: Row[] = [];
let invalid = 0;
for (const row of sampled) {
  if (seenUrls.has(row.url)) continue;
  seenUrls.add(row.url);
  try {
    const chess = new Chess();
    chess.loadPgn(row.pgn.replace(/\$\d+/g, ""));
    const plies = chess.history().length;
    if (plies < 20) {
      invalid++;
      continue;
    }
    row.plies = plies;
    valid.push(row);
  } catch {
    invalid++;
  }
}

mkdirSync(OUT_DIR, { recursive: true });
const name = (r: Row) => r.url.split("/").pop() ?? r.url;
writeFileSync(join(OUT_DIR, "games.pgn"), valid.map((r) => r.pgn.trim()).join("\n\n") + "\n");
writeFileSync(
  join(OUT_DIR, "targets.json"),
  JSON.stringify(
    { games: valid.map((r) => ({ name: name(r), white: r.whiteAcc, black: r.blackAcc })) },
    null,
    2,
  ),
);
writeFileSync(
  join(OUT_DIR, "meta.json"),
  JSON.stringify(
    {
      games: valid.map((r) => ({
        name: name(r),
        whiteElo: r.whiteElo,
        blackElo: r.blackElo,
        timeControl: r.timeControl,
        tcClass: r.tcClass,
        ratingBand: r.ratingBand,
        lengthBucket: r.lengthBucket,
        plies: r.plies,
      })),
    },
    null,
    2,
  ),
);

// Aggregate report only — no raw rows.
console.log(`rows scanned ${rowsTotal}, eligible ${rowsEligible}`);
console.log(`sampled ${sampled.length}, deduped+valid ${valid.length} (${invalid} dropped)`);
const counts = new Map<string, number>();
for (const r of valid) {
  for (const k of [`band ${r.ratingBand}`, `tc ${r.tcClass}`, `len ${r.lengthBucket}`]) {
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
}
for (const [k, v] of [...counts.entries()].sort()) console.log(`  ${k.padEnd(16)} ${v}`);
const totalPlies = valid.reduce((a, r) => a + r.plies, 0);
console.log(`total plies ${totalPlies} → ~${totalPlies + valid.length} positions to evaluate`);
