/**
 * Fetch a current-model validation set of low-rated games from chess.com.
 *
 *   node scripts/fetch-lowrated-validation.ts [--target N] [--max-requests N]
 *
 * Snowballs from known ~1100-1300 seed players (TTuken's recent opponents)
 * through the public archive API: matchmaking pairs similar ratings, so
 * opponents-of-opponents stay in the band. Keeps only games with an
 * `accuracies` field (i.e. analyzed by chess.com's CURRENT model — the GM
 * dataset's labels are from the June-2022 model) played in recent months.
 * Writes scripts/fixtures/lowrated-current/{games.pgn,targets.json,meta.json}
 * in the calibrate-gm.ts fixtures format.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Chess } from "chess.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "scripts/fixtures/lowrated-current");

const argv = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};
const TARGET = Number(arg("--target", "60"));
const MAX_REQUESTS = Number(arg("--max-requests", "120"));
const MAX_RATING = 1350; // both players at or below → avg stays ~<1300
const MAX_PER_USER = 4; // accepted games per archive owner — avoid one-player bias
const MONTHS = ["2026/06", "2026/05", "2026/04"];
// TTuken's games are already the 20-fixture set — keep this set independent.
const EXCLUDE = new Set(["ttuken"]);

const SEEDS = [
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

let requests = 0;
async function api(url: string): Promise<unknown | null> {
  if (requests >= MAX_REQUESTS) return null;
  requests++;
  await new Promise((r) => setTimeout(r, 300));
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "gmbit accuracy calibration (matthias.tugcu@gmail.com)" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function ratingBand(avgElo: number): string {
  if (avgElo < 1200) return "<1200";
  if (avgElo < 1600) return "1200-1600";
  if (avgElo < 2000) return "1600-2000";
  return "2000+";
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

const queue: string[] = [...SEEDS];
const visited = new Set<string>(SEEDS);
const seenUrls = new Set<string>();
const rows: Row[] = [];

outer: while (queue.length > 0 && rows.length < TARGET && requests < MAX_REQUESTS) {
  const user = queue.shift()!;
  let acceptedForUser = 0;
  for (const month of MONTHS) {
    if (rows.length >= TARGET || requests >= MAX_REQUESTS) break outer;
    if (acceptedForUser >= MAX_PER_USER) break;
    const data = (await api(`https://api.chess.com/pub/player/${user}/games/${month}`)) as {
      games?: ApiGame[];
    } | null;
    if (!data?.games) continue;
    for (const g of data.games) {
      const wu = g.white.username.toLowerCase();
      const bu = g.black.username.toLowerCase();
      // Snowball: every opponent in the band is a future source.
      for (const u of [wu, bu]) {
        if (!visited.has(u) && !EXCLUDE.has(u)) {
          visited.add(u);
          queue.push(u);
        }
      }
      if (rows.length >= TARGET || acceptedForUser >= MAX_PER_USER) continue;
      if (!g.accuracies || !g.pgn || g.rules !== "chess") continue;
      if (EXCLUDE.has(wu) || EXCLUDE.has(bu)) continue;
      if (!["bullet", "blitz", "rapid"].includes(g.time_class ?? "")) continue;
      if (g.white.rating > MAX_RATING || g.black.rating > MAX_RATING) continue;
      if (seenUrls.has(g.url)) continue;
      const plies = (g.pgn.match(/%clk/g) ?? []).length;
      if (plies < 20 || plies > 160) continue;
      try {
        const chess = new Chess();
        chess.loadPgn(g.pgn.replace(/\$\d+/g, ""));
        if (chess.history().length < 20) continue;
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
          plies: chess.history().length,
        });
      } catch {
        // unparseable PGN — skip
      }
    }
    process.stderr.write(
      `\r${rows.length}/${TARGET} games  (${requests} requests, queue ${queue.length})   `,
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

// Aggregates only.
console.log(`collected ${rows.length} games in ${requests} requests`);
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
