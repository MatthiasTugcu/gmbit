/**
 * Fetch a current-model calibration set of ~1500-rated games from chess.com.
 *
 *   node scripts/fetch-midelo-validation.ts [--target N] [--max-requests N]
 *
 * Self-seeding: bootstraps from the live leaderboard (top players) plus the
 * repo's known-active low-rated usernames, then does a RATING-ATTRACTION walk
 * toward 1500 — each step expands the frontier player whose observed rating is
 * closest to the target, so the crawl descends from the high bootstraps and
 * climbs from the low ones until it settles in the band, where chess.com
 * matchmaking keeps opponents-of-opponents nearby. Keeps only games with an
 * `accuracies` field (chess.com's CURRENT model) where BOTH players sit in the
 * band. Writes scripts/fixtures/midelo-current/{games.pgn,targets.json,meta.json}
 * in the calibrate-gm.ts fixtures format.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Chess } from "chess.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const argv = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};
const TARGET = Number(arg("--target", "180"));
const MAX_REQUESTS = Number(arg("--max-requests", "1400"));

// Centre the crawl on any rating: the attraction walk pulls the frontier toward
// --center and accepts games with both players in [--lo, --hi].
const TARGET_RATING = Number(arg("--center", "1500"));
const BAND_LO = Number(arg("--lo", String(TARGET_RATING - 200))); // both players in band
const BAND_HI = Number(arg("--hi", String(TARGET_RATING + 200)));
const CORRIDOR_LO = BAND_LO - 250; // only queue opponents seen within this soft corridor
const CORRIDOR_HI = BAND_HI + 250;
const OUT_DIR = join(ROOT, "scripts/fixtures", arg("--out", "midelo-current"));
const MAX_PER_USER = 3; // accepted games per archive owner — avoid one-player bias
const MONTHS = ["2026/06", "2026/05", "2026/04", "2026/03"];

// Known-active, review-using low-rated usernames from the existing fixture set —
// the walk climbs from these toward 1500.
const LOW_SEEDS = [
  "kizaganata1", "maestro_us", "moffo7386", "nurzhhan", "tabachess",
  "advoji", "larsen89", "marfogg", "skipbin", "sorryna09",
  "xavierbrazon1", "ch3ckmale", "domcost", "iblunder-alec", "rabd2201",
  "timokup54", "turbomatty4", "cpolito87", "queensballs", "skwi88",
];

interface ApiGame {
  url: string;
  pgn?: string;
  time_control?: string;
  time_class?: string;
  rules?: string;
  accuracies?: { white: number; black: number };
  white: { username: string; rating: number };
  black: { username: string; rating: number };
}

const UA = "gmbit accuracy calibration (matthias.tugcu@gmail.com)";
let requests = 0;
async function api(url: string): Promise<unknown | null> {
  if (requests >= MAX_REQUESTS) return null;
  requests++;
  await new Promise((r) => setTimeout(r, 260));
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** 100-point rating buckets, so any --center stratifies cleanly for the fit. */
function ratingBand(avgElo: number): string {
  const lo = Math.floor(avgElo / 100) * 100;
  return `${lo}-${lo + 100}`;
}

function lengthBucket(plies: number): string {
  return plies <= 50 ? "short" : plies <= 90 ? "medium" : "long";
}

interface Row {
  url: string;
  whiteAcc: number;
  blackAcc: number;
  whiteElo: number;
  blackElo: number;
  timeControl: string;
  tcClass: string;
  pgn: string;
  plies: number;
}

// Priority frontier: pop the unvisited user whose observed rating is closest to
// TARGET_RATING. Keeps the walk converging on the band from both directions.
interface FrontierEntry {
  user: string;
  rating: number;
}
const frontier: FrontierEntry[] = [];
const visited = new Set<string>();
const seenUrls = new Set<string>();
const rows: Row[] = [];

function enqueue(user: string, rating: number) {
  const u = user.toLowerCase();
  if (visited.has(u)) return;
  if (rating < CORRIDOR_LO || rating > CORRIDOR_HI) return;
  visited.add(u);
  frontier.push({ user: u, rating });
}

function popClosest(): FrontierEntry | null {
  if (frontier.length === 0) return null;
  let best = 0;
  for (let i = 1; i < frontier.length; i++) {
    if (Math.abs(frontier[i].rating - TARGET_RATING) < Math.abs(frontier[best].rating - TARGET_RATING)) {
      best = i;
    }
  }
  return frontier.splice(best, 1)[0];
}

// Bootstrap: leaderboard (descend) + low seeds (climb).
const lb = (await api("https://api.chess.com/pub/leaderboards")) as
  | Record<string, { username: string; score?: number }[]>
  | null;
if (lb) {
  for (const cat of ["live_blitz", "live_rapid", "live_bullet"]) {
    for (const p of lb[cat]?.slice(0, 10) ?? []) enqueue(p.username, 2800);
  }
}
for (const u of LOW_SEEDS) enqueue(u, 1200);

while (frontier.length > 0 && rows.length < TARGET && requests < MAX_REQUESTS) {
  const node = popClosest();
  if (!node) break;
  let acceptedForUser = 0;
  for (const month of MONTHS) {
    if (rows.length >= TARGET || requests >= MAX_REQUESTS) break;
    if (acceptedForUser >= MAX_PER_USER) break;
    const data = (await api(
      `https://api.chess.com/pub/player/${node.user}/games/${month}`,
    )) as { games?: ApiGame[] } | null;
    if (!data?.games) continue;
    for (const g of data.games) {
      // Snowball: queue both players at their observed game rating.
      enqueue(g.white.username, g.white.rating);
      enqueue(g.black.username, g.black.rating);

      if (rows.length >= TARGET || acceptedForUser >= MAX_PER_USER) continue;
      if (!g.accuracies || !g.pgn || g.rules !== "chess") continue;
      if (!["bullet", "blitz", "rapid"].includes(g.time_class ?? "")) continue;
      if (g.white.rating < BAND_LO || g.white.rating > BAND_HI) continue;
      if (g.black.rating < BAND_LO || g.black.rating > BAND_HI) continue;
      if (seenUrls.has(g.url)) continue;
      const clkPlies = (g.pgn.match(/%clk/g) ?? []).length;
      if (clkPlies < 20 || clkPlies > 160) continue;
      try {
        const chess = new Chess();
        chess.loadPgn(g.pgn.replace(/\$\d+/g, ""));
        const plies = chess.history().length;
        if (plies < 20) continue;
        seenUrls.add(g.url);
        acceptedForUser++;
        rows.push({
          url: g.url,
          whiteAcc: g.accuracies.white,
          blackAcc: g.accuracies.black,
          whiteElo: g.white.rating,
          blackElo: g.black.rating,
          timeControl: g.time_control ?? "?",
          tcClass: g.time_class!,
          pgn: g.pgn,
          plies,
        });
      } catch {
        // unparseable PGN — skip
      }
    }
    process.stderr.write(
      `\r${rows.length}/${TARGET} games  (${requests} req, frontier ${frontier.length}, last @${node.rating})   `,
    );
  }
}
process.stderr.write("\n");

mkdirSync(OUT_DIR, { recursive: true });
const name = (r: Row) => r.url.split("/").pop() ?? r.url;
writeFileSync(join(OUT_DIR, "games.pgn"), rows.map((r) => r.pgn.trim()).join("\n\n") + "\n");
writeFileSync(
  join(OUT_DIR, "targets.json"),
  JSON.stringify(
    { games: rows.map((r) => ({ name: name(r), white: r.whiteAcc, black: r.blackAcc })) },
    null,
    2,
  ),
);
writeFileSync(
  join(OUT_DIR, "meta.json"),
  JSON.stringify(
    {
      games: rows.map((r) => ({
        name: name(r),
        whiteElo: r.whiteElo,
        blackElo: r.blackElo,
        timeControl: r.timeControl,
        tcClass: r.tcClass,
        ratingBand: ratingBand((r.whiteElo + r.blackElo) / 2),
        lengthBucket: lengthBucket(r.plies),
        plies: r.plies,
      })),
    },
    null,
    2,
  ),
);

console.log(`\ncollected ${rows.length} games in ${requests} requests`);
const counts = new Map<string, number>();
for (const r of rows) {
  const band = ratingBand((r.whiteElo + r.blackElo) / 2);
  for (const k of [`band ${band}`, `tc ${r.tcClass}`, `len ${lengthBucket(r.plies)}`]) {
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
}
for (const [k, v] of [...counts.entries()].sort()) console.log(`  ${k.padEnd(16)} ${v}`);
const totalPlies = rows.reduce((a, r) => a + r.plies, 0);
console.log(`total plies ${totalPlies} → ~${totalPlies + rows.length} positions`);
