# Chess.com-Style Game Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the heuristic move analysis with chess.com-style classification (real opening book, full class ladder incl. Excellent/Great/Miss, two-pass engine analysis) and Lichess-method game accuracy.

**Architecture:** Pure logic moves into `src/lib/analysis/` (openings lookup, classification ladder, sacrifice heuristic, accuracy math) with vitest coverage. The engine wrapper gains MultiPV. The React hook `use-game-analysis.ts` becomes pure orchestration: base pass at depth 16/MultiPV 2 over every position, then a depth-20 refinement pass over critical moves, re-deriving all classifications from a single pure `annotate` function each time evals change.

**Tech Stack:** Next.js 16 (App Router), TypeScript, chess.js 1.4, Stockfish 18 lite WASM (web worker, UCI), vitest, vendored lichess/chess-openings TSV dataset.

**Spec:** `docs/superpowers/specs/2026-06-11-chesscom-analysis-design.md`

**Repo warning (from AGENTS.md):** This project's Next.js version may differ from your training data. If you touch anything Next-specific beyond what this plan shows (routing, config, imports of `next/*`), read the relevant guide in `node_modules/next/dist/docs/` first. The tasks below avoid Next-specific APIs almost entirely (pure TS modules + one dynamic JSON import).

**Conventions:** All engine scores in the analysis layer are **white-positive** (`Score = { cp?, mate? }`). "Mover winrate" = win% from the perspective of the player who moved. Position key = first 4 FEN fields joined by spaces.

---

### Task 1: Vitest setup

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (scripts + devDependency)
- Test: `src/lib/analysis/smoke.test.ts` (temporary, deleted in Task 3)

- [ ] **Step 1: Install vitest**

Run: `npm install -D vitest`
Expected: exits 0, `vitest` appears in `package.json` devDependencies.

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
```

- [ ] **Step 3: Add test script to `package.json`**

In `"scripts"`, add: `"test": "vitest run"`.

- [ ] **Step 4: Create smoke test**

`src/lib/analysis/smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("vitest", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: 1 test passes.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/lib/analysis/smoke.test.ts
git commit -m "chore: add vitest for pure analysis modules"
```

---

### Task 2: Vendor openings dataset + build script

**Files:**
- Create: `vendor/chess-openings/a.tsv` … `e.tsv` (downloaded)
- Create: `scripts/build-openings.mjs`
- Create: `src/data/openings.json` (generated, committed)
- Modify: `package.json` (script)

The dataset is `lichess-org/chess-openings`: 5 TSV files, header row `eco	name	pgn`, one opening line per row (verified 2026-06-11).

- [ ] **Step 1: Download the TSVs**

```bash
mkdir -p vendor/chess-openings
for f in a b c d e; do
  curl -sf "https://raw.githubusercontent.com/lichess-org/chess-openings/master/$f.tsv" -o "vendor/chess-openings/$f.tsv"
done
head -2 vendor/chess-openings/a.tsv
```

Expected: first line is `eco	name	pgn` (tab-separated), second line is `A00	Amar Opening	1. Nh3`.

- [ ] **Step 2: Write `scripts/build-openings.mjs`**

Rules: every position along every line goes into the map. A line's *final* position gets that line's name unconditionally (exact match wins); *prefix* positions get the name only if no entry exists yet. Keys are the first 4 FEN fields.

```js
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
```

- [ ] **Step 3: Add npm script and generate**

In `package.json` scripts add: `"build:openings": "node scripts/build-openings.mjs"`.

Run: `npm run build:openings`
Expected: prints roughly `openings: ~3700 lines (0 skipped) -> ~7000-8000 positions` and `src/data/openings.json` exists. If more than a handful of lines are skipped, stop and investigate the PGN parsing.

- [ ] **Step 4: Sanity-check known positions**

```bash
node -e '
const { Chess } = require("chess.js");
const map = require("./src/data/openings.json");
const k = (f) => f.split(" ").slice(0, 4).join(" ");
const c = new Chess();
["e4","c5","Nf3","d6","d4","cxd4","Nxd4","Nf6","Nc3","a6"].forEach((m) => c.move(m));
console.log("najdorf:", map[k(c.fen())]);
const d = new Chess();
d.move("e4"); d.move("e5");
console.log("open game:", map[k(d.fen())]);
'
```

Expected: `najdorf: Sicilian Defense: Najdorf Variation` and `open game:` some King's Pawn/Open Game name. If `undefined`, the key function or replay is broken — fix before continuing.

- [ ] **Step 5: Commit**

```bash
git add vendor/chess-openings scripts/build-openings.mjs src/data/openings.json package.json
git commit -m "feat: vendor lichess opening book and generate position lookup"
```

---

### Task 3: Openings module (book detection + opening name)

**Files:**
- Create: `src/lib/analysis/openings.ts`
- Test: `src/lib/analysis/openings.test.ts`
- Delete: `src/lib/analysis/smoke.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/lib/analysis/openings.test.ts`:

```ts
import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { bookMoves, positionKey } from "./openings";
import openingsJson from "@/data/openings.json";

const BOOK = openingsJson as Record<string, string>;

/** Replay SAN moves from the start, returning fens[0..n]. */
function fensOf(sans: string[]): string[] {
  const chess = new Chess();
  const fens = [chess.fen()];
  for (const san of sans) {
    chess.move(san);
    fens.push(chess.fen());
  }
  return fens;
}

describe("positionKey", () => {
  it("strips halfmove and fullmove counters", () => {
    expect(
      positionKey("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"),
    ).toBe("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -");
  });
});

describe("bookMoves", () => {
  it("tags theory moves as book and names the opening", () => {
    const { isBook, openingName } = bookMoves(
      fensOf(["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6"]),
      BOOK,
    );
    expect(isBook).toEqual([true, true, true, true, true, true, true, true, true, true]);
    expect(openingName).toBe("Sicilian Defense: Najdorf Variation");
  });

  it("ends book forever once the game leaves theory", () => {
    // 3. Ra2?? is never theory; 3...Nf6 transposes back to a known position
    // but book must NOT resume.
    const { isBook } = bookMoves(fensOf(["e4", "e5", "Ra2"]), BOOK);
    expect(isBook).toEqual([true, true, false]);

    const longer = bookMoves(fensOf(["e4", "e5", "Ke2", "Nf6", "Ke1"]), BOOK);
    expect(longer.isBook.slice(2)).toEqual([false, false, false]);
  });

  it("ignores engine eval entirely: offbeat non-theory moves are not book", () => {
    // 1. a3 e5 2. h3 is a fine eval but leaves the dataset quickly.
    const { isBook } = bookMoves(fensOf(["a3", "e5", "h3"]), BOOK);
    expect(isBook[2]).toBe(false);
  });

  it("returns all-false with no book loaded", () => {
    const { isBook, openingName } = bookMoves(fensOf(["e4", "e5"]), null);
    expect(isBook).toEqual([false, false]);
    expect(openingName).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- openings`
Expected: FAIL — cannot resolve `./openings`.

Note: if the Najdorf name assertion fails on the exact string once the module exists, check the actual value in `src/data/openings.json` (dataset wording can drift) and pin the test to the dataset's exact name — but it must start with `"Sicilian Defense: Najdorf"`.

- [ ] **Step 3: Implement `src/lib/analysis/openings.ts`**

```ts
/**
 * Opening book backed by the generated lichess/chess-openings position map.
 * A move is "book" while the position after it is known theory; once a game
 * leaves the book it never re-enters, even via transposition.
 */

export type OpeningsMap = Record<string, string>;

/** Safety bound — the dataset rarely exceeds this depth. */
export const MAX_BOOK_PLY = 40;

/** First four FEN fields: board, side to move, castling, en passant. */
export function positionKey(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}

let cached: OpeningsMap | null | undefined;

/** Lazy-load the openings map; resolves null (and logs once) on failure. */
export async function loadOpenings(): Promise<OpeningsMap | null> {
  if (cached !== undefined) return cached;
  try {
    const mod = await import("@/data/openings.json");
    cached = mod.default as OpeningsMap;
  } catch (err) {
    console.warn("openings book failed to load; book detection disabled", err);
    cached = null;
  }
  return cached;
}

export interface BookInfo {
  /** isBook[i] — whether move i (0-based ply) is a book move. */
  isBook: boolean[];
  /** Name attached to the deepest in-book position reached, if any. */
  openingName: string | null;
}

/** fens[0] = starting position, fens[i] = position after move i-1. */
export function bookMoves(fens: string[], book: OpeningsMap | null): BookInfo {
  const isBook: boolean[] = [];
  let openingName: string | null = null;
  let inBook = book !== null;
  for (let i = 1; i < fens.length; i++) {
    if (!inBook || i > MAX_BOOK_PLY) {
      isBook.push(false);
      inBook = false;
      continue;
    }
    const name = book![positionKey(fens[i])];
    if (name !== undefined) {
      isBook.push(true);
      openingName = name;
    } else {
      isBook.push(false);
      inBook = false;
    }
  }
  return { isBook, openingName };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- openings`
Expected: all PASS.

- [ ] **Step 5: Delete the smoke test and commit**

```bash
rm src/lib/analysis/smoke.test.ts
git add -A src/lib/analysis
git commit -m "feat: opening book lookup with book-never-returns rule"
```

---

### Task 4: Classification math — winrate, mover score, move accuracy

**Files:**
- Create: `src/lib/analysis/classify.ts`
- Test: `src/lib/analysis/classify.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/lib/analysis/classify.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { moveAccuracy, moverScore, moverWinrate, whiteWinrate } from "./classify";

describe("whiteWinrate", () => {
  it("maps cp through the lichess logistic", () => {
    expect(whiteWinrate({ cp: 0 })).toBeCloseTo(50, 5);
    expect(whiteWinrate({ cp: 100 })).toBeCloseTo(59.1, 1);
    expect(whiteWinrate({ cp: -100 })).toBeCloseTo(40.9, 1);
    expect(whiteWinrate({ cp: 5000 })).toBeCloseTo(whiteWinrate({ cp: 1500 }), 5); // clamped
  });
  it("treats mate as 0/100", () => {
    expect(whiteWinrate({ mate: 3 })).toBe(100);
    expect(whiteWinrate({ mate: -1 })).toBe(0);
  });
  it("defaults to 50 with no data", () => {
    expect(whiteWinrate({})).toBe(50);
  });
});

describe("moverWinrate", () => {
  it("flips for black", () => {
    expect(moverWinrate("b", { cp: -100 })).toBeCloseTo(59.1, 1);
    expect(moverWinrate("b", { mate: -2 })).toBe(100);
  });
});

describe("moverScore (total order: mate-for > cp > mate-against)", () => {
  it("ranks faster mates higher", () => {
    expect(moverScore("w", { mate: 2 })).toBeGreaterThan(moverScore("w", { mate: 5 }));
  });
  it("ranks any mate-for above any cp", () => {
    expect(moverScore("w", { mate: 30 })).toBeGreaterThan(moverScore("w", { cp: 1500 }));
  });
  it("ranks slower mates-against higher (less bad)", () => {
    expect(moverScore("w", { mate: -5 })).toBeGreaterThan(moverScore("w", { mate: -2 }));
    expect(moverScore("w", { cp: -1500 })).toBeGreaterThan(moverScore("w", { mate: -30 }));
  });
  it("is symmetric for black", () => {
    expect(moverScore("b", { mate: -2 })).toBe(moverScore("w", { mate: 2 }));
    expect(moverScore("b", { cp: -120 })).toBe(moverScore("w", { cp: 120 }));
  });
});

describe("moveAccuracy", () => {
  it("matches the published lichess curve", () => {
    expect(moveAccuracy(0)).toBe(100);
    expect(moveAccuracy(10)).toBeCloseTo(63.6, 1);
    expect(moveAccuracy(20)).toBeCloseTo(40.0, 1);
    expect(moveAccuracy(100)).toBe(0);
  });
  it("clamps negative loss (depth noise) to 100", () => {
    expect(moveAccuracy(-3)).toBe(100);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- classify`
Expected: FAIL — cannot resolve `./classify`.

- [ ] **Step 3: Implement the math in `src/lib/analysis/classify.ts`**

```ts
/**
 * Pure classification + accuracy math. All Score values are WHITE-POSITIVE;
 * the `mover` argument re-orients them. No engine, no React, no I/O.
 */
import type { Color } from "@/types/analysis";

export interface Score {
  cp?: number;
  mate?: number;
}

/** Lichess logistic cp -> win% (0..100) for White; mate collapses to 0/100. */
export function whiteWinrate(s: Score): number {
  if (s.mate !== undefined) return s.mate > 0 ? 100 : 0;
  if (s.cp === undefined) return 50;
  const clamped = Math.max(-1500, Math.min(1500, s.cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clamped)) - 1);
}

export function moverWinrate(mover: Color, s: Score): number {
  const w = whiteWinrate(s);
  return mover === "w" ? w : 100 - w;
}

/**
 * Total order over evals from the mover's perspective, for "is this move at
 * least as good as the engine's best" comparisons. Winrate saturates at 0/100
 * and can't distinguish mate-in-2 from mate-in-9; this can.
 */
export function moverScore(mover: Color, s: Score): number {
  const sign = mover === "w" ? 1 : -1;
  if (s.mate !== undefined) {
    const m = s.mate * sign;
    return m > 0 ? 100000 - m : -100000 - m;
  }
  return (s.cp ?? 0) * sign;
}

/** Published lichess per-move accuracy from win% loss, clamped to [0, 100]. */
export function moveAccuracy(loss: number): number {
  const a = 103.1668 * Math.exp(-0.04354 * Math.max(0, loss)) - 3.1669;
  return Math.max(0, Math.min(100, a));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- classify`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis/classify.ts src/lib/analysis/classify.test.ts
git commit -m "feat: winrate, mover score, and move accuracy math"
```

---

### Task 5: Sacrifice heuristic

**Files:**
- Create: `src/lib/analysis/sacrifice.ts`
- Test: `src/lib/analysis/sacrifice.test.ts`

A deliberately simple static check (spec: "unit tests pin the known cases rather than chasing perfection"). chess.js v1.4 exposes `chess.attackers(square, color)` — verify before relying on it.

- [ ] **Step 1: Verify the chess.js attackers API**

```bash
node -e '
const { Chess } = require("chess.js");
const c = new Chess();
console.log(typeof c.attackers, c.attackers("e4", "w"));
'
```

Expected: `function [ ... ]` (an array). If `attackers` is undefined, check `node_modules/chess.js/README.md` for the current attack-query API and adapt the implementation below.

- [ ] **Step 2: Write the failing tests**

`src/lib/analysis/sacrifice.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isSacrifice } from "./sacrifice";

describe("isSacrifice", () => {
  it("detects a queen left en prise to a defended pawn (greek-gift style)", () => {
    // White queen takes the h7 pawn defended by the king: Qd3xh7+ is material loss.
    // Position: simple construction — white Qd3, black pawn h7 defended by Kg8.
    const fen = "6k1/7p/8/8/8/3Q4/8/6K1 w - - 0 1";
    expect(isSacrifice(fen, "d3h7")).toBe(true);
  });

  it("does not flag a protected capture of equal value", () => {
    // Rook takes rook, recapture possible: an exchange, not a sacrifice.
    const fen = "3r2k1/8/8/8/8/8/3R4/3R2K1 w - - 0 1";
    expect(isSacrifice(fen, "d2d8")).toBe(false);
  });

  it("does not flag a safe developing move", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    expect(isSacrifice(fen, "g1f3")).toBe(false);
  });

  it("does not flag winning an undefended piece", () => {
    // Queen takes a free rook.
    const fen = "3r2k1/8/8/8/8/8/3Q4/6K1 w - - 0 1";
    expect(isSacrifice(fen, "d2d8")).toBe(false);
  });

  it("detects a piece moved to a square where a pawn wins it", () => {
    // Knight hops onto a square attacked by a pawn, no compensation.
    const fen = "6k1/8/2p5/8/3N4/8/8/6K1 w - - 0 1";
    expect(isSacrifice(fen, "d4b5")).toBe(true); // b5 attacked by c6 pawn
  });

  it("never flags pawn moves without capture", () => {
    const fen = "6k1/8/8/3p4/8/8/4P3/6K1 w - - 0 1";
    expect(isSacrifice(fen, "e2e4")).toBe(false); // even though d5 pawn could take
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- sacrifice`
Expected: FAIL — cannot resolve `./sacrifice`.

- [ ] **Step 4: Implement `src/lib/analysis/sacrifice.ts`**

```ts
/**
 * Static "did this move give up material" check used to gate Brilliant.
 * One-exchange approximation, not a full SEE — known classics are pinned by
 * tests; subtle compensation cases are out of scope by design.
 */
import { Chess } from "chess.js";
import { parseUci } from "@/lib/chess-game";
import type { PieceType } from "@/types/analysis";

const VAL: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export function isSacrifice(fenBefore: string, uci: string): boolean {
  const chess = new Chess(fenBefore);
  const { from, to, promotion } = parseUci(uci);
  const moving = chess.get(from);
  if (!moving) return false;

  const target = chess.get(to);
  let m;
  try {
    m = chess.move({ from, to, promotion });
  } catch {
    return false;
  }
  if (!m) return false;

  const mover = moving.color;
  const opp = mover === "w" ? "b" : "w";
  const movedVal = VAL[(promotion as PieceType) ?? moving.type];
  // Quiet pawn pushes and minor shuffles can't sacrifice meaningful material.
  if (movedVal < 3) return false;

  // Material gained on the move itself (en passant captures report isCapture
  // with an empty target square — that's a pawn).
  const gained = target ? VAL[target.type] : m.isCapture() ? 1 : 0;

  // Can the opponent profitably take the piece on its new square?
  const attackers = chess.attackers(to, opp);
  if (attackers.length === 0) return false;
  const defenders = chess.attackers(to, mover);

  let oppGain: number;
  if (defenders.length === 0) {
    oppGain = movedVal; // hangs outright
  } else {
    // Defended: opponent's best is cheapest-attacker-takes, we recapture.
    const nonKing = attackers.filter((sq) => chess.get(sq)!.type !== "k");
    if (nonKing.length === 0) return false; // only the king attacks a defended piece
    const cheapest = Math.min(...nonKing.map((sq) => VAL[chess.get(sq)!.type]));
    oppGain = movedVal - cheapest;
  }

  return oppGain - gained >= 2; // at least ~2 pawns of net material offered
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- sacrifice`
Expected: all PASS. If a position assertion fails, debug the *position* first (print `new Chess(fen).ascii()`) — hand-written FENs are the usual culprit, not the logic.

- [ ] **Step 6: Commit**

```bash
git add src/lib/analysis/sacrifice.ts src/lib/analysis/sacrifice.test.ts
git commit -m "feat: static sacrifice detection for brilliant moves"
```

---

### Task 6: New move classes in types + classification ladder

**Files:**
- Modify: `src/types/analysis.ts`
- Modify: `src/lib/analysis/classify.ts`
- Test: `src/lib/analysis/classify.test.ts` (extend)

- [ ] **Step 1: Extend the types**

In `src/types/analysis.ts`, replace the `MoveClass` union and add `promo` to `Move`:

```ts
export type MoveClass =
  | "brilliant"
  | "great"
  | "best"
  | "excellent"
  | "good"
  | "book"
  | "inaccuracy"
  | "mistake"
  | "miss"
  | "blunder";
```

In `interface Move`, after `to: Square;` add:

```ts
  /** Promotion piece in UCI form (e.g. "q"), when the move promotes. */
  promo?: string;
```

- [ ] **Step 2: Record promotion in `parsePgn`**

In `src/lib/chess-game.ts`, inside the `history.forEach` push, after `to: h.to,` add:

```ts
      promo: h.promotion,
```

- [ ] **Step 3: Write the failing ladder tests**

Append to `src/lib/analysis/classify.test.ts`:

```ts
import { classifyMove, type ClassifyArgs } from "./classify";

/** Baseline args: a quiet non-book move in an equal position. */
function args(over: Partial<ClassifyArgs>): ClassifyArgs {
  return {
    mover: "w",
    playedUci: "g1f3",
    before: { lines: [{ score: { cp: 30 }, uci: "e2e4" }, { score: { cp: 10 }, uci: "d2d4" }] },
    after: { cp: 20 },
    isBook: false,
    sacrifice: () => false,
    ...over,
  };
}

describe("classifyMove ladder", () => {
  it("book wins over everything", () => {
    expect(classifyMove(args({ isBook: true, after: { cp: -500 } }))).toBe("book");
  });

  it("best: exact uci match including promotion piece", () => {
    expect(
      classifyMove(
        args({
          playedUci: "e7e8q",
          before: { lines: [{ score: { cp: 400 }, uci: "e7e8q" }, { score: { cp: 100 }, uci: "a1a2" }] },
          after: { cp: 380 },
        }),
      ),
    ).toBe("best");
    // Underpromotion when the engine wanted a queen is NOT best.
    expect(
      classifyMove(
        args({
          playedUci: "e7e8n",
          before: { lines: [{ score: { cp: 400 }, uci: "e7e8q" }, { score: { cp: 100 }, uci: "a1a2" }] },
          after: { cp: 200 },
        }),
      ),
    ).not.toBe("best");
  });

  it("best: a different move that evaluates at least as well counts as best", () => {
    expect(
      classifyMove(
        args({
          playedUci: "d2d4",
          before: { lines: [{ score: { cp: 30 }, uci: "e2e4" }, { score: { cp: 25 }, uci: "d2d4" }] },
          after: { cp: 35 }, // played move turned out better than predicted best
        }),
      ),
    ).toBe("best");
  });

  it("best-by-eval does not apply in dead-lost mate positions", () => {
    // Mover is getting mated either way; equal-winrate (0) must not auto-best.
    expect(
      classifyMove(
        args({
          playedUci: "h2h3",
          before: { lines: [{ score: { mate: -5 }, uci: "g1f1" }] },
          after: { mate: -3 }, // faster mate against: strictly worse by moverScore
        }),
      ),
    ).not.toBe("best");
  });

  it("great: best move when the second line is >= 12 win% worse", () => {
    expect(
      classifyMove(
        args({
          playedUci: "e2e4",
          before: { lines: [{ score: { cp: 50 }, uci: "e2e4" }, { score: { cp: -100 }, uci: "d2d4" }] },
          after: { cp: 45 },
        }),
      ),
    ).toBe("great");
  });

  it("brilliant: best + sacrifice, not lost after, not already crushing", () => {
    const a = args({
      playedUci: "d3h7",
      before: { lines: [{ score: { cp: 150 }, uci: "d3h7" }, { score: { cp: -200 }, uci: "a1a2" }] },
      after: { cp: 140 },
      sacrifice: () => true,
    });
    expect(classifyMove(a)).toBe("brilliant");
    // Already completely winning -> downgraded (no cheap brilliancies up a queen).
    expect(
      classifyMove({
        ...a,
        before: { lines: [{ score: { cp: 1400 }, uci: "d3h7" }] },
        after: { cp: 1390 },
      }),
    ).not.toBe("brilliant");
  });

  it("excellent under 2, good under 5", () => {
    // cp 30 -> 0 is ~1.7 win% loss; cp 100 -> 0 is ~9.1.
    expect(classifyMove(args({ after: { cp: 0 } }))).toBe("excellent");
    expect(
      classifyMove(
        args({
          before: { lines: [{ score: { cp: 80 }, uci: "e2e4" }] },
          after: { cp: 0 }, // ~7.3 loss... see threshold table below
        }),
      ),
    ).toBe("inaccuracy");
    expect(
      classifyMove(
        args({
          before: { lines: [{ score: { cp: 50 }, uci: "e2e4" }] },
          after: { cp: 0 }, // ~4.6 loss
        }),
      ),
    ).toBe("good");
  });

  it("miss: a decisive chance thrown away lands as miss, not mistake/blunder", () => {
    expect(
      classifyMove(
        args({
          before: { lines: [{ score: { mate: 2 }, uci: "d1h5" }] }, // mate available
          after: { cp: 50 }, // back to near-equal
        }),
      ),
    ).toBe("miss");
    expect(
      classifyMove(
        args({
          before: { lines: [{ score: { cp: 600 }, uci: "d1h5" }] }, // ~90 win%
          after: { cp: 30 }, // ~55 win%
        }),
      ),
    ).toBe("miss");
  });

  it("hanging mate-in-1 is a blunder even from a winning position", () => {
    expect(
      classifyMove(
        args({
          before: { lines: [{ score: { cp: 600 }, uci: "d1h5" }] },
          after: { mate: -1 },
        }),
      ),
    ).toBe("blunder");
  });

  it("inaccuracy / mistake / blunder thresholds", () => {
    // From cp 0: loss 10 win% ~ cp -185? Use direct constructions instead:
    const base = { lines: [{ score: { cp: 0 }, uci: "e2e4" }] };
    expect(classifyMove(args({ before: base, after: { cp: -80 } }))).toBe("inaccuracy"); // ~7.3 loss
    expect(classifyMove(args({ before: base, after: { cp: -180 } }))).toBe("mistake"); // ~15.7 loss
    expect(classifyMove(args({ before: base, after: { cp: -600 } }))).toBe("blunder"); // ~38 loss
  });
});
```

**Threshold note for the implementer:** the win%-loss numbers in comments are approximate. After implementing, compute the real values with the `whiteWinrate` function (e.g. `node`-REPL or a quick console.log in the test) and fix any test that straddles a boundary the wrong way — adjust the *cp inputs* in tests so each lands clearly inside its intended class (e.g. aim for loss ≈ 1 for excellent, ≈ 3.5 for good, ≈ 7 for inaccuracy, ≈ 15 for mistake, ≈ 30 for blunder). Do not adjust the ladder thresholds themselves (2/5/10/20, great-gap 12, miss-floor 75/60).

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm test -- classify`
Expected: FAIL — `classifyMove` not exported.

- [ ] **Step 5: Implement the ladder in `src/lib/analysis/classify.ts`**

Append:

```ts
import type { MoveClass } from "@/types/analysis";

export interface LineEval {
  /** White-positive score of this engine line. */
  score: Score;
  /** First move of the line in UCI (e.g. "e2e4", "e7e8q"). */
  uci?: string;
}

export interface PositionEval {
  /** lines[0] = engine best (also the position eval); lines[1] = second best. */
  lines: LineEval[];
}

export interface ClassifyArgs {
  mover: Color;
  /** Played move as full UCI including promotion piece. */
  playedUci: string;
  /** Search of the position before the move. */
  before: PositionEval;
  /** Eval of the position after the move (from the next position's search). */
  after: Score;
  isBook: boolean;
  /** Lazy: only consulted when the move qualifies as best. */
  sacrifice: () => boolean;
}

const GREAT_GAP = 12; // win% gap to 2nd line that makes a best move "the only move"
const MISS_BEFORE = 75; // win% that counts as a decisive chance
const MISS_AFTER = 60; // dropping below this throws the chance away

export function classifyMove(a: ClassifyArgs): MoveClass {
  if (a.isBook) return "book";

  const best = a.before.lines[0];
  const wBefore = moverWinrate(a.mover, best.score);
  const wAfter = moverWinrate(a.mover, a.after);
  const loss = Math.max(0, wBefore - wAfter);

  const matchesBest = !!best.uci && best.uci === a.playedUci;
  // Eval comparison uses moverScore, not winrate: winrate saturates at 0/100
  // in decided positions and would call every move "best".
  const asGoodAsBest = moverScore(a.mover, a.after) >= moverScore(a.mover, best.score);

  if (matchesBest || asGoodAsBest) {
    if (a.sacrifice() && wAfter >= 30 && wBefore <= 95) return "brilliant";
    const second = a.before.lines[1];
    if (second && wBefore - moverWinrate(a.mover, second.score) >= GREAT_GAP) {
      return "great";
    }
    return "best";
  }

  if (loss < 2) return "excellent";
  if (loss < 5) return "good";

  // Hanging mate-in-1 is always a blunder, even from a winning position.
  const oppMatesIn1 =
    a.after.mate !== undefined && (a.mover === "w" ? a.after.mate === -1 : a.after.mate === 1);
  if (oppMatesIn1) return "blunder";

  // Miss: a decisive chance (mate or near-won position) thrown away.
  const hadMate =
    best.score.mate !== undefined && (a.mover === "w" ? best.score.mate > 0 : best.score.mate < 0);
  if ((hadMate || wBefore >= MISS_BEFORE) && loss >= 10 && wAfter < MISS_AFTER) return "miss";

  // Newly allowing a forced mate (best line had none) upgrades an inaccuracy
  // to a mistake. Applied only at loss >= 5 so best tries in dead-lost
  // positions aren't punished for engine-found mates.
  const allowsMate =
    a.after.mate !== undefined &&
    (a.mover === "w" ? a.after.mate < 0 : a.after.mate > 0) &&
    !(best.score.mate !== undefined && (a.mover === "w" ? best.score.mate < 0 : best.score.mate > 0));

  if (loss < 10) return allowsMate ? "mistake" : "inaccuracy";
  if (loss < 20) return "mistake";
  return "blunder";
}
```

- [ ] **Step 6: Run tests, fix boundary-straddling test inputs per the threshold note**

Run: `npm test -- classify`
Expected: all PASS after pinning exact cp inputs.

- [ ] **Step 7: Run the full suite and lint**

Run: `npm test && npx tsc --noEmit`
Expected: tests pass; `tsc` will report errors in `classification.tsx` / `class-bar.tsx` (`Record<MoveClass, ...>` missing the new keys) and `use-game-analysis.ts` — that's expected; they're fixed in Tasks 8–9. If `tsc` reports errors in files this plan doesn't touch, investigate.

- [ ] **Step 8: Commit**

```bash
git add src/types/analysis.ts src/lib/chess-game.ts src/lib/analysis/classify.ts src/lib/analysis/classify.test.ts
git commit -m "feat: chess.com classification ladder with great/excellent/miss"
```

---

### Task 7: Game accuracy (harmonic + volatility-weighted)

**Files:**
- Modify: `src/lib/analysis/classify.ts`
- Test: `src/lib/analysis/classify.test.ts` (extend)

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/analysis/classify.test.ts`:

```ts
import { gameAccuracy, type MoveAccEntry } from "./classify";

function entries(pattern: [color: "w" | "b", acc: number, isBook?: boolean][]): MoveAccEntry[] {
  return pattern.map(([color, acc, isBook]) => ({ color, acc, isBook: isBook ?? false }));
}

describe("gameAccuracy", () => {
  it("perfect play is 100 for both sides", () => {
    const e = entries([["w", 100], ["b", 100], ["w", 100], ["b", 100]]);
    const flat = [50, 50, 50, 50, 50];
    expect(gameAccuracy(e, flat)).toEqual({ white: 100, black: 100 });
  });

  it("book moves are excluded entirely", () => {
    // White: two book moves (acc irrelevant) + one 80-acc move -> only the 80 counts.
    const e = entries([["w", 0, true], ["b", 100], ["w", 0, true], ["b", 100], ["w", 80]]);
    const flat = [50, 50, 50, 50, 50, 50];
    expect(gameAccuracy(e, flat).white).toBe(80);
  });

  it("harmonic mean drags the score toward blunders more than a plain average", () => {
    const e = entries([["w", 100], ["w", 100], ["w", 100], ["w", 20]]);
    const flat = [50, 50, 50, 50, 50];
    const { white } = gameAccuracy(e, flat);
    expect(white).toBeLessThan(80); // plain average
    expect(white).toBeGreaterThan(20);
  });

  it("returns 0 for a side with no countable moves", () => {
    const e = entries([["w", 100]]);
    expect(gameAccuracy(e, [50, 50]).black).toBe(0);
  });

  it("weights volatile phases more", () => {
    // Same per-move accuracies; the 60-acc move sits in a volatile window for
    // `swingy` and a calm window for `calm` -> swingy scores lower for white.
    const e = entries([["w", 100], ["b", 100], ["w", 60], ["b", 100], ["w", 100], ["b", 100]]);
    const calm = [50, 50, 50, 50, 50, 50, 50];
    const swingy = [50, 50, 90, 30, 50, 50, 50];
    expect(gameAccuracy(e, swingy).white).toBeLessThan(gameAccuracy(e, calm).white);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- classify`
Expected: FAIL — `gameAccuracy` not exported.

- [ ] **Step 3: Implement in `src/lib/analysis/classify.ts`**

Append:

```ts
export interface MoveAccEntry {
  color: Color;
  /** Per-move accuracy 0..100 (from moveAccuracy). */
  acc: number;
  /** Book moves are excluded from accuracy. */
  isBook: boolean;
}

function stdDev(xs: number[]): number {
  if (xs.length === 0) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/**
 * Lichess game-accuracy method: mean of (a) win%-volatility-weighted mean and
 * (b) harmonic mean of per-move accuracies, per color, book moves excluded.
 * `whiteWinrates` has one entry per position (moves.length + 1).
 */
export function gameAccuracy(
  moves: MoveAccEntry[],
  whiteWinrates: number[],
): { white: number; black: number } {
  const windowSize = Math.max(2, Math.min(8, Math.ceil(moves.length / 10)));

  // Volatility weight for move i: std-dev of the win% window around it.
  const weights = moves.map((_, i) => {
    const start = Math.max(0, i + 1 - windowSize);
    const window = whiteWinrates.slice(start, i + 2);
    return Math.max(0.5, Math.min(12, stdDev(window)));
  });

  const perColor = (color: Color): number => {
    const accs: number[] = [];
    const ws: number[] = [];
    moves.forEach((m, i) => {
      if (m.color !== color || m.isBook) return;
      accs.push(m.acc);
      ws.push(weights[i]);
    });
    if (accs.length === 0) return 0;
    const weighted =
      accs.reduce((sum, a, i) => sum + a * ws[i], 0) / ws.reduce((a, b) => a + b, 0);
    const harmonic = accs.length / accs.reduce((sum, a) => sum + 1 / Math.max(a, 0.1), 0);
    return round1((weighted + harmonic) / 2);
  };

  return { white: perColor("w"), black: perColor("b") };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all analysis tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis/classify.ts src/lib/analysis/classify.test.ts
git commit -m "feat: harmonic + volatility-weighted game accuracy"
```

---

### Task 8: Engine MultiPV support

**Files:**
- Modify: `src/lib/engine/index.ts`
- Test: `src/lib/engine/index.test.ts` (parser only — the worker itself is manual-tested)

- [ ] **Step 1: Write the failing parser tests**

`src/lib/engine/index.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseInfoLine } from "./index";

describe("parseInfoLine", () => {
  it("parses a multipv line", () => {
    const info = parseInfoLine(
      "info depth 16 seldepth 24 multipv 2 score cp -31 nodes 1000 nps 500000 pv d7d5 e4d5",
    );
    expect(info).toMatchObject({ depth: 16, multipv: 2, cp: -31, pv: ["d7d5", "e4d5"] });
  });

  it("defaults multipv to 1 when absent", () => {
    const info = parseInfoLine("info depth 10 score cp 20 pv e2e4");
    expect(info?.multipv).toBe(1);
  });

  it("parses mate scores", () => {
    const info = parseInfoLine("info depth 12 multipv 1 score mate -3 pv g8h8");
    expect(info?.mate).toBe(-3);
  });

  it("returns null for lines without useful fields", () => {
    expect(parseInfoLine("info string NNUE evaluation enabled")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- engine`
Expected: FAIL — `parseInfoLine` is not exported.

- [ ] **Step 3: Implement MultiPV in `src/lib/engine/index.ts`**

3a. Extend the public types (replace the existing `AnalysisInfo` / `AnalyzeOptions`):

```ts
export interface EngineLine {
  /** Centipawn evaluation from the side-to-move's perspective. */
  cp?: number;
  /** Mate in N (positive = side to move mates, negative = gets mated). */
  mate?: number;
  /** Principal variation, as UCI move strings. */
  pv: string[];
}

export interface AnalysisInfo {
  /** Depth of this report. */
  depth: number;
  /** Which MultiPV slot this info line belongs to (1 = best). */
  multipv: number;
  /** Centipawn evaluation from the side-to-move's perspective (line 1). */
  cp?: number;
  /** Mate in N (positive = side to move mates, negative = gets mated). */
  mate?: number;
  /** Principal variation of line 1, as UCI move strings (e.g. "e2e4"). */
  pv: string[];
  /** All requested lines, index 0 = best. Present on the final result. */
  lines?: EngineLine[];
  /** Nodes per second, when reported. */
  nps?: number;
}

export interface AnalyzeOptions {
  /** Target search depth. */
  depth?: number;
  /** Max think time in milliseconds. If both depth and movetime are set, both apply. */
  movetime?: number;
  /** Number of engine lines to search (UCI MultiPV). Default 1. */
  multiPv?: number;
  /** Called for each intermediate `info` line (line 1 only). */
  onProgress?: (info: AnalysisInfo) => void;
  /** Abort signal — calling abort() cancels the analysis. */
  signal?: AbortSignal;
}
```

3b. In `Pending`, add a per-search line accumulator:

```ts
type Pending = {
  fen: string;
  opts: AnalyzeOptions;
  resolve: (info: AnalysisInfo) => void;
  reject: (err: unknown) => void;
  latest: AnalysisInfo | null;
  /** Latest line per MultiPV slot (key = multipv index). */
  lines: Map<number, EngineLine>;
  abortHandler?: () => void;
};
```

3c. In the `info` branch of `worker.onmessage`, replace the body with:

```ts
    if (current && line.startsWith("info ")) {
      const info = parseInfoLine(line);
      if (info) {
        if (info.pv.length > 0) {
          current.lines.set(info.multipv, { cp: info.cp, mate: info.mate, pv: info.pv });
        }
        // Only line 1 drives the top-level snapshot and progress callbacks,
        // so MultiPV >= 2 stays invisible to single-line consumers.
        if (info.multipv === 1) {
          current.latest = info;
          current.opts.onProgress?.(info);
        }
      }
      return;
    }
```

3d. In the `bestmove` branch, after the existing pv-seeding logic, attach the lines (the final object construction becomes):

```ts
      const bestmove = line.split(/\s+/)[1];
      const final = finished.latest ?? { depth: 0, multipv: 1, pv: [] };
      if (bestmove && bestmove !== "(none)" && (final.pv.length === 0 || final.pv[0] !== bestmove)) {
        final.pv = [bestmove, ...final.pv.slice(1)];
      }
      const ordered = [...finished.lines.entries()].sort((a, b) => a[0] - b[0]).map(([, l]) => l);
      if (ordered.length > 0) {
        ordered[0] = { ...ordered[0], pv: final.pv.length > 0 ? final.pv : ordered[0].pv };
        final.lines = ordered;
      }
      finished.resolve(final);
```

3e. In `analyze()`, send the MultiPV option before `ucinewgame`. Add a `let lastMultiPv = 1;` next to `let current` at the factory top, then inside the `new Promise` executor before `send("ucinewgame")`:

```ts
        const pending: Pending = { fen, opts, resolve, reject, latest: null, lines: new Map() };
        current = pending;
        // ... existing signal handling unchanged ...

        const multiPv = opts.multiPv ?? 1;
        if (multiPv !== lastMultiPv) {
          send(`setoption name MultiPV value ${multiPv}`);
          lastMultiPv = multiPv;
        }
        send("ucinewgame");
```

3f. In `parseInfoLine`: change signature to `export function parseInfoLine(...)`, add `let multipv: number | undefined;`, a `case "multipv": multipv = Number(tokens[++i]); break;` in the switch, and return `{ depth: depth ?? 0, multipv: multipv ?? 1, cp, mate, pv, nps }`.

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test -- engine && npx tsc --noEmit`
Expected: parser tests PASS. `tsc` still fails only in `classification.tsx`/`class-bar.tsx`/`use-game-analysis.ts` (pending Tasks 9–10) — `use-engine-eval.ts` must compile clean since `AnalysisInfo` kept its single-line fields.

- [ ] **Step 5: Commit**

```bash
git add src/lib/engine/index.ts src/lib/engine/index.test.ts
git commit -m "feat: MultiPV support in the engine wrapper"
```

---

### Task 9: UI for the new classes

**Files:**
- Modify: `src/lib/classification.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/components/analysis/class-bar.tsx`

- [ ] **Step 1: Add CLS entries and graph marks in `src/lib/classification.tsx`**

Add a star and cross icon next to the existing ones:

```tsx
const Star = (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2l-6.1 3.4 1.4-6.8L2.2 9.1l6.9-.8L12 2z" />
  </svg>
);

const Cross = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
```

Replace the `CLS` record (full chess.com ladder order):

```tsx
export const CLS: Record<
  MoveClass,
  { label: string; sym: string; short: string; icon?: JSX.Element }
> = {
  brilliant:  { label: "Brilliant",  sym: "!!",     short: "!!" },
  great:      { label: "Great",      sym: "!",      short: "!",      icon: Star },
  best:       { label: "Best move",  sym: "✓", short: "✓", icon: Crown },
  excellent:  { label: "Excellent",  sym: "✓", short: "✓", icon: Check },
  good:       { label: "Good",       sym: "✓", short: "✓" },
  book:       { label: "Book",       sym: "●", short: "",       icon: Book },
  inaccuracy: { label: "Inaccuracy", sym: "?!",     short: "?!" },
  mistake:    { label: "Mistake",    sym: "?",      short: "?" },
  miss:       { label: "Miss",       sym: "✕", short: "✕", icon: Cross },
  blunder:    { label: "Blunder",    sym: "??",     short: "??" },
};

export const GRAPH_MARK: Set<MoveClass> = new Set([
  "brilliant",
  "great",
  "miss",
  "inaccuracy",
  "mistake",
  "blunder",
]);
```

(Note: `good` loses its Check icon to `excellent` — good becomes a plain text check, matching chess.com's quieter treatment of good moves.)

- [ ] **Step 2: Add colors in `src/app/globals.css`**

Next to the existing `--c-*` block (lines ~16–22), add and adjust:

```css
  --c-great:     oklch(0.70 0.14 230);   /* blue */
  --c-excellent: oklch(0.76 0.15 148);   /* green, just under best */
  --c-miss:      oklch(0.70 0.17 40);    /* salmon red-orange */
```

and tone down good so excellent reads stronger:

```css
  --c-good:      oklch(0.75 0.08 145);   /* muted green */
```

In the `--color-c-*` theme block (lines ~127–133), add:

```css
  --color-c-great: var(--c-great);
  --color-c-excellent: var(--c-excellent);
  --color-c-miss: var(--c-miss);
```

- [ ] **Step 3: Extend the legend in `src/components/analysis/class-bar.tsx`**

```ts
const LEGEND_ORDER: MoveClass[] = [
  "brilliant",
  "great",
  "best",
  "excellent",
  "good",
  "book",
  "inaccuracy",
  "mistake",
  "miss",
  "blunder",
];
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: the only remaining errors are in `src/lib/engine/use-game-analysis.ts` (rewritten next task). `move-list.tsx`, `board.tsx`, `eval-graph.tsx` need no changes — they render from `CLS`/`var(--c-…)` generically.

- [ ] **Step 5: Commit**

```bash
git add src/lib/classification.tsx src/app/globals.css src/components/analysis/class-bar.tsx
git commit -m "feat: badges, colors and legend for great/excellent/miss"
```

---

### Task 10: Rewrite the analysis hook (two-pass) + wire opening name

**Files:**
- Rewrite: `src/lib/engine/use-game-analysis.ts`
- Modify: `src/components/analysis/analysis-screen.tsx:53-73`

- [ ] **Step 1: Rewrite `src/lib/engine/use-game-analysis.ts`**

Full replacement:

```ts
"use client";

import { useEffect, useState } from "react";
import type { AnalysisGame } from "@/lib/chess-game";
import type { Move } from "@/types/analysis";
import {
  classifyMove,
  gameAccuracy,
  moveAccuracy,
  moverWinrate,
  whiteWinrate,
  type PositionEval,
  type Score,
} from "@/lib/analysis/classify";
import { bookMoves, loadOpenings, type BookInfo } from "@/lib/analysis/openings";
import { isSacrifice } from "@/lib/analysis/sacrifice";
import { createEngine, type AnalysisInfo } from "./index";

const BASE_DEPTH = 16;
const REFINE_DEPTH = 20;
const MULTI_PV = 2;
/** Win% swing that flags a position as critical for the refinement pass. */
const REFINE_SWING = 15;
/** Best-vs-second gap that makes a move a Great candidate worth refining. */
const REFINE_GAP = 8;

export interface GameAnalysisProgress {
  done: number;
  total: number;
  running: boolean;
}

export interface GameAnalysisResult {
  game: AnalysisGame;
  whiteAccuracy: number;
  blackAccuracy: number;
  openingName: string | null;
  progress: GameAnalysisProgress;
}

/** Convert a side-to-move engine result into a white-positive PositionEval. */
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
        mate: l.mate !== undefined ? l.mate * sign : undefined,
      },
      uci: l.pv[0],
    })),
  };
}

interface Annotated {
  moves: Move[];
  white: number;
  black: number;
}

/**
 * Re-derive every classification + both accuracies from whatever evals exist.
 * Pure and cheap (n = plies), so it simply reruns whenever evals change.
 */
function annotate(
  game: AnalysisGame,
  positions: (PositionEval | undefined)[],
  book: BookInfo,
): Annotated {
  const moves = game.moves.slice();
  const accEntries: { color: "w" | "b"; acc: number; isBook: boolean }[] = [];
  const winrates: number[] = [];
  if (positions[0]) winrates.push(whiteWinrate(positions[0].lines[0].score));

  for (let i = 0; i < moves.length; i++) {
    const before = positions[i];
    const after = positions[i + 1];
    if (!before || !after) break;
    const m = moves[i];
    const afterScore: Score = after.lines[0].score;
    const playedUci = m.from + m.to + (m.promo ?? "");
    const isBook = book.isBook[i] ?? false;
    const cls = classifyMove({
      mover: m.c,
      playedUci,
      before,
      after: afterScore,
      isBook,
      sacrifice: () => isSacrifice(game.fens[i], playedUci),
    });
    moves[i] = { ...m, cls, cp: afterScore.cp, mate: afterScore.mate };

    const loss = Math.max(
      0,
      moverWinrate(m.c, before.lines[0].score) - moverWinrate(m.c, afterScore),
    );
    accEntries.push({ color: m.c, acc: moveAccuracy(loss), isBook });
    winrates.push(whiteWinrate(afterScore));
  }

  const { white, black } = gameAccuracy(accEntries, winrates);
  return { moves, white, black };
}

/** Position indices worth a deeper look after the base pass. */
function refinementTargets(
  game: AnalysisGame,
  positions: (PositionEval | undefined)[],
  annotatedMoves: Move[],
  book: BookInfo,
): number[] {
  const targets = new Set<number>();
  for (let i = 0; i < game.moves.length; i++) {
    const before = positions[i];
    const after = positions[i + 1];
    if (!before || !after || book.isBook[i]) continue;
    const m = game.moves[i];
    const cls = annotatedMoves[i].cls;
    const wBefore = moverWinrate(m.c, before.lines[0].score);
    const wAfter = moverWinrate(m.c, after.lines[0].score);
    const second = before.lines[1];
    const gap = second ? wBefore - moverWinrate(m.c, second.score) : 0;
    const playedUci = m.from + m.to + (m.promo ?? "");
    const playedIsBest = before.lines[0].uci === playedUci;

    const critical =
      cls === "mistake" ||
      cls === "blunder" ||
      cls === "miss" ||
      cls === "great" ||
      cls === "brilliant" ||
      (playedIsBest && gap >= REFINE_GAP) ||
      Math.abs(wBefore - wAfter) >= REFINE_SWING;

    if (critical) {
      targets.add(i);
      targets.add(i + 1);
    }
  }
  return [...targets].sort((a, b) => a - b);
}

/**
 * Two-pass Stockfish annotation: every position at BASE_DEPTH / MultiPV 2,
 * then critical positions again at REFINE_DEPTH. Classifications, accuracies
 * and the opening name are re-derived progressively as evals arrive.
 */
export function useGameAnalysis(game: AnalysisGame): GameAnalysisResult {
  const [annotated, setAnnotated] = useState<AnalysisGame>(game);
  const [accuracy, setAccuracy] = useState({ white: 0, black: 0 });
  const [openingName, setOpeningName] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: game.moves.length });

  useEffect(() => {
    setAnnotated(game);
    setAccuracy({ white: 0, black: 0 });
    setOpeningName(null);
    setProgress({ done: 0, total: game.moves.length });

    if (typeof window === "undefined") return;
    if (game.moves.length === 0) return;
    // Pre-annotated games (e.g. the bundled demo) skip engine analysis.
    if (game.moves.every((m) => m.cp !== undefined || m.mate !== undefined)) {
      setProgress({ done: game.moves.length, total: game.moves.length });
      return;
    }

    let cancelled = false;
    const engine = createEngine();

    (async () => {
      try {
        const book = bookMoves(game.fens, await loadOpenings());
        if (cancelled) return;
        setOpeningName(book.openingName);

        await engine.ready();
        const positions: (PositionEval | undefined)[] = new Array(game.fens.length);

        const apply = () => {
          const { moves, white, black } = annotate(game, positions, book);
          setAnnotated((cur) => ({ ...cur, moves }));
          setAccuracy({ white, black });
        };

        // Base pass.
        for (let i = 0; i < game.fens.length; i++) {
          if (cancelled) return;
          const info = await engine.analyze(game.fens[i], {
            depth: BASE_DEPTH,
            multiPv: MULTI_PV,
          });
          if (cancelled) return;
          positions[i] = toPositionEval(game.fens[i], info);
          if (i > 0) {
            apply();
            setProgress((p) => ({ ...p, done: i }));
          }
        }

        // Refinement pass over critical positions.
        const base = annotate(game, positions, book);
        const targets = refinementTargets(game, positions, base.moves, book);
        setProgress({ done: game.moves.length, total: game.moves.length + targets.length });
        for (let t = 0; t < targets.length; t++) {
          if (cancelled) return;
          const idx = targets[t];
          const info = await engine.analyze(game.fens[idx], {
            depth: REFINE_DEPTH,
            multiPv: MULTI_PV,
          });
          if (cancelled) return;
          positions[idx] = toPositionEval(game.fens[idx], info);
          apply();
          setProgress((p) => ({ ...p, done: game.moves.length + t + 1 }));
        }
      } catch {
        // Aborts / teardown land here — partial annotation stays visible.
      }
    })();

    return () => {
      cancelled = true;
      engine.destroy();
    };
  }, [game]);

  return {
    game: annotated,
    whiteAccuracy: accuracy.white,
    blackAccuracy: accuracy.black,
    openingName,
    progress: {
      done: progress.done,
      total: progress.total,
      running: progress.done < progress.total,
    },
  };
}
```

- [ ] **Step 2: Wire the opening name in `analysis-screen.tsx`**

In the `useGameAnalysis` destructuring (line ~53) add `openingName`:

```ts
  const {
    game: analyzedGame,
    whiteAccuracy,
    blackAccuracy,
    openingName,
    progress: analysisProgress,
  } = useGameAnalysis(game);
```

In the `players` memo, add the opening override and dependency:

```ts
    return {
      ...base,
      white: { ...base.white, accuracy: whiteAccuracy || base.white.accuracy },
      black: { ...base.black, accuracy: blackAccuracy || base.black.accuracy },
      opening: openingName ?? base.opening,
    };
  }, [analyzedGame.headers, analysisProgress.total, whiteAccuracy, blackAccuracy, openingName]);
```

- [ ] **Step 3: Full verification**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: everything passes, zero type errors anywhere.

- [ ] **Step 4: Commit**

```bash
git add src/lib/engine/use-game-analysis.ts src/components/analysis/analysis-screen.tsx
git commit -m "feat: two-pass game analysis with book, ladder and new accuracy"
```

---

### Task 11: Manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Build and start the dev server**

Run: `npm run dev` (background) and open the printed URL.

- [ ] **Step 2: Demo game sanity**

The bundled demo game must render exactly as before (it is pre-annotated; engine analysis is skipped). Check the move list, class bar and eval graph for visual regressions from the color changes.

- [ ] **Step 3: Import a real game and verify against chess.com**

Import a PGN of a real game (ideally one the user has analyzed on chess.com). Verify:

1. Opening theory moves show the Book badge and stop being book exactly when the game leaves known lines; the opening name appears in the players header.
2. Progress runs through the base pass, then visibly extends for the refinement pass.
3. Best moves carry the crown only when they genuinely match/equal the engine's choice; Excellent/Good distribute plausibly; at least obvious blunders/misses line up with chess.com's labels.
4. Accuracies land within a few points of chess.com's numbers for the same game (exact parity is impossible — different engine + CAPS is proprietary — but they should be close, not 15 points apart).
5. A game with a promotion classifies the promotion move sensibly.

- [ ] **Step 4: Check analysis wall-time**

A ~40-move game should finish the base pass in roughly 1–2 minutes and refinement in well under another minute on a typical laptop. If it's wildly slower, reduce `BASE_DEPTH` to 15 and flag it to the user rather than silently shipping a 10-minute analysis.

- [ ] **Step 5: Final commit (if any fixes were made)**

```bash
git add -A
git commit -m "fix: post-verification adjustments to analysis"
```
