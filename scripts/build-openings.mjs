// Regenerate src/data/openings.json from the vendored lichess/chess-openings TSVs.
// Usage: node scripts/build-openings.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { Chess } from "chess.js";

const FILES = ["a", "b", "c", "d", "e"].map((x) => `vendor/chess-openings/${x}.tsv`);

const entries = [];
for (const file of FILES) {
  const lines = readFileSync(file, "utf8").split("\n").slice(1); // skip header
  for (const line of lines) {
    if (!line.trim()) continue;
    const [, name, pgn] = line.split("\t");
    if (!name || !pgn) continue;
    entries.push({ name, pgn });
  }
}

const key = (fen) => fen.split(" ").slice(0, 4).join(" ");

const map = {};
let skipped = 0;
for (const { name, pgn } of entries) {
  const chess = new Chess();
  try {
    chess.loadPgn(pgn);
  } catch {
    skipped++;
    continue;
  }
  const sans = chess.history();
  if (sans.length === 0) continue;
  const replay = new Chess();
  const keys = sans.map((san) => {
    replay.move(san);
    return key(replay.fen());
  });
  map[keys[keys.length - 1]] = name; // exact line ending: authoritative
  for (let i = 0; i < keys.length - 1; i++) {
    if (!(keys[i] in map)) map[keys[i]] = name;
  }
}

writeFileSync("src/data/openings.json", JSON.stringify(map));
console.log(
  `openings: ${entries.length} lines (${skipped} skipped) -> ${Object.keys(map).length} positions`,
);
