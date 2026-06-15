/**
 * Diagnostic: run the REAL classifyMove pipeline on cached engine evals across
 * many fixture games and report the class distribution + every "great"/"brilliant"
 * with context. This is the live-pipeline check that the pre-annotated demo game
 * cannot give. Run before/after classifier changes to see their real effect.
 *
 *   node scripts/classify-sample.ts [--games N] [--fixtures dir] [--list great]
 */
import { readFileSync, existsSync, createReadStream } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { Chess } from "chess.js";
import { classifyMove, moverWinrate, type PositionEval, type Score } from "../src/lib/analysis/classify.ts";
import { bookMoves } from "../src/lib/analysis/openings.ts";
import type { AnalysisInfo } from "../src/lib/engine/index.ts";
// NOTE: sacrifice detection is stubbed to false here (sacrifice.ts isn't
// node-loadable), so "brilliant" is undercounted — fine, the focus is the
// great/mistake/blunder distribution.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const arg = (n: string, fb: string) => (argv.indexOf(n) >= 0 ? argv[argv.indexOf(n) + 1] : fb);
const NGAMES = Number(arg("--games", "12"));
const FIX = join(ROOT, arg("--fixtures", "scripts/fixtures/lowrated-current"));
const LIST = arg("--list", "great");
const CACHE = "/tmp/gmbit-eval-cache-gm.ndjson";
const key = (fen: string) => `${fen}|d20|mpv2`;

function toPositionEval(fen: string, info: AnalysisInfo): PositionEval {
  const sign = fen.split(" ")[1] === "b" ? -1 : 1;
  const raw = info.lines?.length ? info.lines : [{ cp: info.cp, mate: info.mate, pv: info.pv }];
  return {
    lines: raw.map((l) => ({
      score: {
        cp: l.cp !== undefined ? l.cp * sign : undefined,
        mate: l.mate !== undefined ? (l.mate === 0 ? -sign : l.mate * sign) : undefined,
      },
      uci: l.pv?.[0],
    })),
  };
}

const pgns = readFileSync(join(FIX, "games.pgn"), "utf8")
  .split(/\n\s*\n(?=\[Event )/).map((s) => s.trim()).filter(Boolean).slice(0, NGAMES);

const games = pgns.map((pgn) => {
  const chess = new Chess();
  chess.loadPgn(pgn.replace(/\$\d+/g, ""));
  const hist = chess.history({ verbose: true });
  return { pgn, hist, fens: [hist[0].before, ...hist.map((m) => m.after)] };
});

const want = new Set(games.flatMap((g) => g.fens.map(key)));
const cache = new Map<string, AnalysisInfo>();
const rl = createInterface({ input: createReadStream(CACHE), crlfDelay: Infinity });
for await (const line of rl) {
  if (!line) continue;
  try { const { k, v } = JSON.parse(line); if (want.has(k)) cache.set(k, v); } catch {}
}

const openings = existsSync(join(ROOT, "src/data/openings.json"))
  ? JSON.parse(readFileSync(join(ROOT, "src/data/openings.json"), "utf8")) : {};

const counts: Record<string, number> = {};
const listed: string[] = [];
let totalMoves = 0;
let analysedGames = 0;

for (const g of games) {
  const positions = g.fens.map((f) => { const i = cache.get(key(f)); return i ? toPositionEval(f, i) : undefined; });
  if (positions.some((p) => !p)) continue; // skip games with uncached positions
  analysedGames++;
  const book = bookMoves(g.fens, openings);
  for (let i = 0; i < g.hist.length; i++) {
    const before = positions[i]!;
    const afterScore: Score = positions[i + 1]!.lines[0].score;
    const m = g.hist[i];
    const playedUci = m.from + m.to + (m.promotion ?? "");
    const cls = classifyMove({
      mover: m.color as "w" | "b", playedUci, before, after: afterScore,
      isBook: book.isBook[i] ?? false,
      sacrifice: () => false,
      recapture: i > 0 && g.hist[i - 1].to === m.to,
    });
    counts[cls] = (counts[cls] ?? 0) + 1;
    totalMoves++;
    if (cls === LIST) {
      const wB = moverWinrate(m.color as "w" | "b", before.lines[0].score);
      const wA = moverWinrate(m.color as "w" | "b", afterScore);
      const recap = i > 0 && g.hist[i - 1].to === m.to ? "RECAP" : "     ";
      listed.push(`  ${m.san.padEnd(8)} ${playedUci} ${recap} win ${wB.toFixed(0)}->${wA.toFixed(0)}`);
    }
  }
}

const order = ["brilliant", "great", "best", "excellent", "good", "book", "inaccuracy", "miss", "mistake", "blunder"];
console.log(`\n${analysedGames} games, ${totalMoves} moves`);
console.log("class        count    per-game   %");
for (const c of order) {
  const n = counts[c] ?? 0;
  console.log(`  ${c.padEnd(11)} ${String(n).padStart(5)}    ${(n / analysedGames).toFixed(1).padStart(5)}   ${((100 * n) / totalMoves).toFixed(1).padStart(4)}%`);
}
console.log(`\n${LIST} moves (${listed.length}) — RECAP = lands on opponent's last-move square:`);
console.log(listed.join("\n"));
