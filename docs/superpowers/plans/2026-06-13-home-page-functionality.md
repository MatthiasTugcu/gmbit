# Home Page Functionality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the landing page do real work — selectable analysis depth, a second game source (Lichess) with remembered usernames, a local recent-analyses list, and a dedicated "how it works" page.

**Architecture:** Pure logic lives in small `src/lib` modules (each with co-located vitest tests). The two fetch sources share one `FetchPanel` component. Analysis depth is a `"fast" | "deep"` mode handed off through sessionStorage into the existing `useGameAnalysis` hook. History is `localStorage`-backed and recorded by `/analyze` on load.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, vitest. Engine is single-threaded WASM Stockfish via a worker pool.

---

## File Structure

New files:
- `src/lib/lichess.ts` — Lichess game-archive client, mapping to the shared `RecentGame` shape.
- `src/lib/landing-prefs.ts` — per-source remembered username (localStorage).
- `src/lib/history.ts` — recent-analyses store (localStorage).
- `src/components/landing/fetch-panel.tsx` — shared username → game-list panel for both sources.
- `src/app/features/page.tsx` — "How it works" page.
- `src/app/features/try-example-button.tsx` — client island that opens the demo game.

Modified files:
- `src/types/analysis.ts` — add `AnalysisMode`.
- `src/lib/engine/use-game-analysis.ts` — mode config + `searchTotal` + hook signature.
- `src/lib/pending-game.ts` — pending mode, pending meta, clear-pgn, `PendingFetch.source`.
- `src/components/analysis/analysis-screen.tsx` — accept + forward `mode`.
- `src/app/analyze/analyze-client.tsx` — read mode/meta, record history.
- `src/components/landing/landing-screen.tsx` — third source, wired modes, history section, nav link.

Deleted:
- `src/components/landing/chesscom-panel.tsx` — replaced by `FetchPanel`.

Test command (whole suite): `npm test`. Single file: `npx vitest run <path>`.
Typecheck/build: `npm run build`. Lint: `npm run lint`.

---

## Task 1: AnalysisMode type

**Files:**
- Modify: `src/types/analysis.ts`

- [ ] **Step 1: Add the type**

Append to `src/types/analysis.ts`:

```ts
/** Engine effort selected on the landing page. */
export type AnalysisMode = "fast" | "deep";
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no usages yet).

- [ ] **Step 3: Commit**

```bash
git add src/types/analysis.ts
git commit -m "feat: add AnalysisMode type"
```

---

## Task 2: Analysis mode config in useGameAnalysis

**Files:**
- Modify: `src/lib/engine/use-game-analysis.ts`
- Test: `src/lib/engine/use-game-analysis.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/engine/use-game-analysis.test.ts` (keep existing imports; add `searchTotal` and `MODE_CONFIG` to the import from `./use-game-analysis`):

```ts
import { searchTotal, MODE_CONFIG, toPositionEval } from "./use-game-analysis";

describe("searchTotal", () => {
  it("counts base + refine passes in deep mode", () => {
    expect(searchTotal(40, 30, "deep")).toBe(70);
  });

  it("counts only the base pass in fast mode", () => {
    expect(searchTotal(40, 30, "fast")).toBe(40);
  });
});

describe("MODE_CONFIG", () => {
  it("skips the deep pass in fast mode and keeps it in deep mode", () => {
    expect(MODE_CONFIG.fast.refineDepth).toBeNull();
    expect(MODE_CONFIG.deep.refineDepth).toBe(20);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/engine/use-game-analysis.test.ts`
Expected: FAIL — `searchTotal`/`MODE_CONFIG` not exported.

- [ ] **Step 3: Replace the hardcoded constants with a mode config**

In `src/lib/engine/use-game-analysis.ts`, add this import near the top (with the other type imports):

```ts
import type { AnalysisMode } from "@/types/analysis";
```

Replace the constant block (the `BASE_DEPTH` / `REFINE_DEPTH` / `MULTI_PV` / `REFINE_MOVETIME_MS` definitions) with:

```ts
interface ModeConfig {
  baseDepth: number;
  /** null = skip the deep refine pass entirely (fast mode). */
  refineDepth: number | null;
  multiPv: number;
  refineMovetimeMs: number;
}

/**
 * Per-mode search parameters. `deep` reproduces the original two-pass
 * behaviour; `fast` runs a single shallow pass for ~3-4x quicker, rougher
 * analysis.
 */
export const MODE_CONFIG: Record<AnalysisMode, ModeConfig> = {
  fast: { baseDepth: 14, refineDepth: null, multiPv: 1, refineMovetimeMs: 0 },
  deep: { baseDepth: 14, refineDepth: 20, multiPv: 2, refineMovetimeMs: 5000 },
};

/** Total engine searches a run will perform, for the monotonic progress bar. */
export function searchTotal(fenCount: number, targetCount: number, mode: AnalysisMode): number {
  return fenCount + (MODE_CONFIG[mode].refineDepth === null ? 0 : targetCount);
}
```

(`POOL_LANES` stays as-is below this block.)

- [ ] **Step 4: Thread the mode through the hook**

Change the hook signature and body. Replace `export function useGameAnalysis(game: AnalysisGame): GameAnalysisResult {` with:

```ts
export function useGameAnalysis(
  game: AnalysisGame,
  mode: AnalysisMode = "deep",
): GameAnalysisResult {
```

Inside the effect, after `const targets = refinementTargets(game, book);`, replace the `totalSearches` line with:

```ts
        const cfg = MODE_CONFIG[mode];
        const totalSearches = searchTotal(game.fens.length, targets.length, mode);
```

Change `runPass` so multiPv comes from the config — replace its body's `multiPv: MULTI_PV` with `multiPv: cfg.multiPv`.

Replace the two `runPass` calls at the bottom of the effect with:

```ts
        await runPass(game.fens.map((_, i) => i), cfg.baseDepth);
        if (cancelled) return;
        if (cfg.refineDepth !== null) {
          await runPass(targets, cfg.refineDepth, cfg.refineMovetimeMs);
        }
```

Add `mode` to the effect dependency array (change `}, [game]);` to `}, [game, mode]);`).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/engine/use-game-analysis.test.ts`
Expected: PASS (existing `toPositionEval` tests + new ones).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS — `analysis-screen.tsx` still calls `useGameAnalysis(game)` (the `mode` default keeps it valid).

- [ ] **Step 7: Commit**

```bash
git add src/lib/engine/use-game-analysis.ts src/lib/engine/use-game-analysis.test.ts
git commit -m "feat: per-mode search config in useGameAnalysis"
```

---

## Task 3: pending-game — mode, meta, clear

**Files:**
- Modify: `src/lib/pending-game.ts`
- Test: `src/lib/pending-game.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/pending-game.test.ts` (extend the import from `./pending-game` to include the new functions and the `PendingMeta` type):

```ts
import {
  clearPendingPgn,
  loadPendingMeta,
  loadPendingMode,
  savePendingMeta,
  savePendingMode,
  type PendingMeta,
} from "./pending-game";

describe("pending mode handoff", () => {
  it("round-trips a known mode", () => {
    const s = memoryStorage();
    savePendingMode(s, "fast");
    expect(loadPendingMode(s)).toBe("fast");
  });

  it("defaults to deep when missing or unknown", () => {
    const s = memoryStorage();
    expect(loadPendingMode(s)).toBe("deep");
    s.setItem("gmbit.pending-mode", "wat");
    expect(loadPendingMode(s)).toBe("deep");
  });
});

describe("pending meta handoff", () => {
  const meta: PendingMeta = { source: "lichess", outcome: "won" };

  it("round-trips the meta", () => {
    const s = memoryStorage();
    savePendingMeta(s, meta);
    expect(loadPendingMeta(s)).toEqual(meta);
  });

  it("returns null when missing or corrupt", () => {
    const s = memoryStorage();
    expect(loadPendingMeta(s)).toBeNull();
    s.setItem("gmbit.pending-meta", "{nope");
    expect(loadPendingMeta(s)).toBeNull();
  });
});

describe("clearPendingPgn", () => {
  it("removes a stored PGN", () => {
    const s = memoryStorage();
    savePendingPgn(s, "1. e4");
    clearPendingPgn(s);
    expect(loadPendingPgn(s)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/pending-game.test.ts`
Expected: FAIL — new exports missing.

- [ ] **Step 3: Implement**

In `src/lib/pending-game.ts`, add the import at the top:

```ts
import type { AnalysisMode } from "@/types/analysis";
```

Add to the `PendingFetch` interface an optional source field:

```ts
export interface PendingFetch {
  username: string;
  games: RecentGame[];
  /** Which provider the games came from (absent on legacy entries = chess.com). */
  source?: "chesscom" | "lichess";
}
```

Add new keys and functions (after the existing exports):

```ts
const MODE_KEY = "gmbit.pending-mode";
const META_KEY = "gmbit.pending-meta";

/** Where a pending game came from, for the recent-analyses history. */
export interface PendingMeta {
  source: "chesscom" | "lichess" | "pgn" | "demo";
  outcome?: "won" | "lost" | "draw";
}

/** Remove the stashed PGN so /analyze falls back to the demo game. */
export function clearPendingPgn(storage: Storage): void {
  try {
    storage.removeItem(PGN_KEY);
  } catch {
    /* storage unavailable — ignore */
  }
}

/** Stash the analysis effort chosen on the landing page. */
export function savePendingMode(storage: Storage, mode: AnalysisMode): void {
  try {
    storage.setItem(MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

/** The chosen mode, defaulting to "deep" when missing or unrecognised. */
export function loadPendingMode(storage: Storage): AnalysisMode {
  try {
    return storage.getItem(MODE_KEY) === "fast" ? "fast" : "deep";
  } catch {
    return "deep";
  }
}

/** Stash where the pending game came from (for history). */
export function savePendingMeta(storage: Storage, meta: PendingMeta): void {
  try {
    storage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    /* ignore */
  }
}

/** The pending game's source meta, if any and parseable. */
export function loadPendingMeta(storage: Storage): PendingMeta | null {
  try {
    const raw = storage.getItem(META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingMeta;
    return typeof parsed?.source === "string" ? parsed : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/pending-game.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pending-game.ts src/lib/pending-game.test.ts
git commit -m "feat: pending mode, meta, and clear-pgn handoff"
```

---

## Task 4: Lichess client

**Files:**
- Create: `src/lib/lichess.ts`
- Test: `src/lib/lichess.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/lichess.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fetchLichessGames, toLichessRecentGame, type LichessApiGame } from "./lichess";

const game = (over: Partial<LichessApiGame> = {}): LichessApiGame => ({
  pgn: "1. e4 e5",
  speed: "blitz",
  lastMoveAt: 1700000000000,
  winner: "white",
  players: {
    white: { user: { name: "DrNykterstein" } },
    black: { user: { name: "foo" } },
  },
  ...over,
});

describe("toLichessRecentGame", () => {
  it("detects the user's side case-insensitively", () => {
    expect(toLichessRecentGame(game(), "drnykterstein")?.userSide).toBe("white");
    expect(toLichessRecentGame(game(), "FOO")?.userSide).toBe("black");
  });

  it("maps winner / no-winner to won / lost / draw", () => {
    expect(toLichessRecentGame(game(), "DrNykterstein")?.outcome).toBe("won");
    expect(toLichessRecentGame(game(), "foo")?.outcome).toBe("lost");
    expect(toLichessRecentGame(game({ winner: undefined }), "foo")?.outcome).toBe("draw");
  });

  it("converts lastMoveAt ms to endTime seconds", () => {
    expect(toLichessRecentGame(game(), "foo")?.endTime).toBe(1700000000);
  });

  it("rejects games without a PGN or without the user", () => {
    expect(toLichessRecentGame(game({ pgn: undefined }), "foo")).toBeNull();
    expect(toLichessRecentGame(game(), "someoneelse")).toBeNull();
  });

  it("handles anonymous opponents without throwing", () => {
    const anon = game({ players: { white: { user: { name: "foo" } }, black: {} } });
    expect(toLichessRecentGame(anon, "foo")?.userSide).toBe("white");
  });
});

describe("fetchLichessGames", () => {
  const ndjsonResponse = (lines: unknown[], status = 200) =>
    ({
      ok: status < 400,
      status,
      text: async () => lines.map((l) => JSON.stringify(l)).join("\n"),
    }) as Response;

  it("parses ndjson newest-first and skips blank/unparseable lines", async () => {
    const body = `${JSON.stringify(game({ lastMoveAt: 2000 }))}\n\n{bad\n${JSON.stringify(
      game({ lastMoveAt: 1000 }),
    )}\n`;
    const fetchImpl = (async () => ({ ok: true, status: 200, text: async () => body }) as Response) as typeof fetch;
    const games = await fetchLichessGames("foo", 10, fetchImpl);
    expect(games.map((g) => g.endTime)).toEqual([2, 1]);
  });

  it("reports an unknown player", async () => {
    const fetchImpl = (async () => ndjsonResponse([], 404)) as typeof fetch;
    await expect(fetchLichessGames("nosuchuser", 10, fetchImpl)).rejects.toThrow(/No Lichess player/);
  });

  it("reports rate limiting", async () => {
    const fetchImpl = (async () => ndjsonResponse([], 429)) as typeof fetch;
    await expect(fetchLichessGames("foo", 10, fetchImpl)).rejects.toThrow(/rate-limit/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/lichess.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `src/lib/lichess.ts`:

```ts
/**
 * Client for Lichess's public game export API.
 *
 * GET /api/games/user/{user} streams the user's games newest-first. With
 * `Accept: application/x-ndjson` it returns newline-delimited JSON (one game
 * per line). The endpoint is CORS-enabled and needs no auth for public games.
 */
import type { RecentGame } from "./chesscom";

/** Slice of Lichess's game object that we consume. */
export interface LichessApiGame {
  pgn?: string;
  winner?: "white" | "black";
  speed?: string;
  /** Unix milliseconds. */
  lastMoveAt?: number;
  players: {
    white?: { user?: { name?: string } };
    black?: { user?: { name?: string } };
  };
}

/** Map a Lichess game to a row for `username`, or null when unusable. */
export function toLichessRecentGame(g: LichessApiGame, username: string): RecentGame | null {
  if (!g.pgn) return null;
  const white = g.players?.white?.user?.name ?? "";
  const black = g.players?.black?.user?.name ?? "";
  const lower = username.trim().toLowerCase();
  const userSide =
    white.toLowerCase() === lower ? "white" : black.toLowerCase() === lower ? "black" : null;
  if (!userSide) return null;
  const outcome = !g.winner ? "draw" : g.winner === userSide ? "won" : "lost";
  return {
    endTime: Math.floor((g.lastMoveAt ?? 0) / 1000),
    pgn: g.pgn,
    white: white || "White",
    black: black || "Black",
    userSide,
    outcome,
    timeClass: g.speed,
  };
}

/** The user's most recent games, newest first. */
export async function fetchLichessGames(
  username: string,
  limit = 100,
  fetchImpl: typeof fetch = fetch,
): Promise<RecentGame[]> {
  const user = encodeURIComponent(username.trim());
  const res = await fetchImpl(
    `https://lichess.org/api/games/user/${user}?max=${limit}&pgnInJson=true`,
    { headers: { Accept: "application/x-ndjson" } },
  );
  if (res.status === 404) {
    throw new Error(`No Lichess player named “${username.trim()}”.`);
  }
  if (res.status === 429) {
    throw new Error("Lichess is rate-limiting — wait a moment and try again.");
  }
  if (!res.ok) {
    throw new Error(`Lichess returned ${res.status} — try again later.`);
  }
  const text = await res.text();
  const games: RecentGame[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed: LichessApiGame;
    try {
      parsed = JSON.parse(trimmed) as LichessApiGame;
    } catch {
      continue; // skip a malformed line rather than failing the whole fetch
    }
    const mapped = toLichessRecentGame(parsed, username);
    if (mapped) games.push(mapped);
  }
  return games;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/lichess.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lichess.ts src/lib/lichess.test.ts
git commit -m "feat: Lichess game-archive client"
```

---

## Task 5: Remembered username prefs

**Files:**
- Create: `src/lib/landing-prefs.ts`
- Test: `src/lib/landing-prefs.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/landing-prefs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { loadUsername, saveUsername } from "./landing-prefs";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  };
}

describe("landing-prefs username", () => {
  it("round-trips a username per source", () => {
    const s = memoryStorage();
    saveUsername(s, "chesscom", "hikaru");
    saveUsername(s, "lichess", "DrNykterstein");
    expect(loadUsername(s, "chesscom")).toBe("hikaru");
    expect(loadUsername(s, "lichess")).toBe("DrNykterstein");
  });

  it("returns empty string when nothing stored", () => {
    expect(loadUsername(memoryStorage(), "chesscom")).toBe("");
  });

  it("ignores storage failures", () => {
    const s = memoryStorage();
    s.setItem = () => {
      throw new Error("quota");
    };
    expect(() => saveUsername(s, "lichess", "x")).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/landing-prefs.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `src/lib/landing-prefs.ts`:

```ts
/** Remembered landing-page input, per fetch source. */
export type FetchSource = "chesscom" | "lichess";

const key = (source: FetchSource) => `gmbit.username.${source}`;

/** The last username used for `source`, or "" when none / unavailable. */
export function loadUsername(storage: Storage, source: FetchSource): string {
  try {
    return storage.getItem(key(source)) ?? "";
  } catch {
    return "";
  }
}

/** Remember `name` as the last username for `source`. */
export function saveUsername(storage: Storage, source: FetchSource, name: string): void {
  try {
    storage.setItem(key(source), name);
  } catch {
    /* storage unavailable — ignore */
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/landing-prefs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/landing-prefs.ts src/lib/landing-prefs.test.ts
git commit -m "feat: remembered username per fetch source"
```

---

## Task 6: Recent-analyses history store

**Files:**
- Create: `src/lib/history.ts`
- Test: `src/lib/history.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/history.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { clearHistory, loadHistory, recordAnalysis, type HistoryEntry } from "./history";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  };
}

const entry = (over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  pgn: "1. e4 e5",
  white: "A",
  black: "B",
  source: "pgn",
  date: 1,
  ...over,
});

describe("history store", () => {
  it("records newest-first", () => {
    const s = memoryStorage();
    recordAnalysis(s, entry({ pgn: "g1" }));
    recordAnalysis(s, entry({ pgn: "g2" }));
    expect(loadHistory(s).map((e) => e.pgn)).toEqual(["g2", "g1"]);
  });

  it("dedupes by pgn and promotes the re-opened game to the front", () => {
    const s = memoryStorage();
    recordAnalysis(s, entry({ pgn: "g1" }));
    recordAnalysis(s, entry({ pgn: "g2" }));
    recordAnalysis(s, entry({ pgn: "g1", date: 99 }));
    const list = loadHistory(s);
    expect(list.map((e) => e.pgn)).toEqual(["g1", "g2"]);
    expect(list[0].date).toBe(99);
  });

  it("caps at 15 entries", () => {
    const s = memoryStorage();
    for (let i = 0; i < 20; i++) recordAnalysis(s, entry({ pgn: `g${i}` }));
    expect(loadHistory(s)).toHaveLength(15);
    expect(loadHistory(s)[0].pgn).toBe("g19");
  });

  it("clears", () => {
    const s = memoryStorage();
    recordAnalysis(s, entry());
    clearHistory(s);
    expect(loadHistory(s)).toEqual([]);
  });

  it("returns [] on corrupt data and ignores write failures", () => {
    const s = memoryStorage();
    s.setItem("gmbit.history", "{not json");
    expect(loadHistory(s)).toEqual([]);
    s.setItem = () => {
      throw new Error("quota");
    };
    expect(() => recordAnalysis(s, entry())).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/history.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `src/lib/history.ts`:

```ts
/** Locally-stored list of recently analysed games for quick re-open. */
export type HistorySource = "chesscom" | "lichess" | "pgn" | "demo";

export interface HistoryEntry {
  pgn: string;
  white: string;
  black: string;
  outcome?: "won" | "lost" | "draw";
  source: HistorySource;
  /** Unix milliseconds when last analysed. */
  date: number;
}

const KEY = "gmbit.history";
const CAP = 15;

/** All stored entries, newest first; [] when none / unreadable. */
export function loadHistory(storage: Storage): HistoryEntry[] {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

/**
 * Record an analysed game: dedupe by exact PGN (re-opening promotes the entry
 * to the front and refreshes its date), newest first, capped at CAP.
 */
export function recordAnalysis(storage: Storage, entry: HistoryEntry): void {
  try {
    const list = loadHistory(storage).filter((e) => e.pgn !== entry.pgn);
    list.unshift(entry);
    storage.setItem(KEY, JSON.stringify(list.slice(0, CAP)));
  } catch {
    /* storage unavailable or quota exceeded — ignore */
  }
}

/** Empty the history. */
export function clearHistory(storage: Storage): void {
  try {
    storage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/history.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/history.ts src/lib/history.test.ts
git commit -m "feat: recent-analyses history store"
```

---

## Task 7: Shared FetchPanel (replaces ChesscomPanel)

**Files:**
- Create: `src/components/landing/fetch-panel.tsx`
- Delete: `src/components/landing/chesscom-panel.tsx`

This is a UI component; the repo has no component tests, so verify via typecheck/lint. It ports `ChesscomPanel` verbatim, then parameterises the source and adds mode/meta/username persistence.

- [ ] **Step 1: Create the panel**

Create `src/components/landing/fetch-panel.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RecentGame } from "@/lib/chesscom";
import type { AnalysisMode } from "@/types/analysis";
import { parsePgn } from "@/lib/chess-game";
import { savePendingFetch, savePendingMeta, savePendingMode, savePendingPgn } from "@/lib/pending-game";
import { loadUsername, saveUsername, type FetchSource } from "@/lib/landing-prefs";

const GAME_LIMIT = 100;

interface Props {
  source: FetchSource;
  /** Human label, e.g. "chess.com" or "Lichess". */
  label: string;
  placeholder: string;
  fetchGames: (username: string, limit: number) => Promise<RecentGame[]>;
  /** Analysis effort to hand off with the chosen game. */
  mode: AnalysisMode;
}

export function FetchPanel({ source, label, placeholder, fetchGames, mode }: Props) {
  const router = useRouter();
  const [username, setUsername] = useState(() =>
    typeof window === "undefined" ? "" : loadUsername(window.localStorage, source),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [games, setGames] = useState<RecentGame[] | null>(null);

  const runFetch = async () => {
    const name = username.trim();
    if (!name) {
      setError(`Enter a ${label} username.`);
      return;
    }
    setLoading(true);
    setError(null);
    setGames(null);
    try {
      const fetched = await fetchGames(name, GAME_LIMIT);
      if (fetched.length === 0) {
        setError(`No games found for “${name}”.`);
      } else {
        setGames(fetched);
        saveUsername(window.localStorage, source, name);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not reach ${label}.`);
    } finally {
      setLoading(false);
    }
  };

  const analyze = (g: RecentGame) => {
    try {
      parsePgn(g.pgn);
    } catch {
      setError("That game's PGN could not be parsed.");
      return;
    }
    savePendingPgn(window.sessionStorage, g.pgn);
    savePendingMode(window.sessionStorage, mode);
    savePendingMeta(window.sessionStorage, { source, outcome: g.outcome });
    if (games) {
      savePendingFetch(window.sessionStorage, { username: username.trim(), games, source });
    }
    router.push("/analyze");
  };

  return (
    <div className="rise-in mt-4 w-full rounded-md border border-line bg-bg-1 p-[18px]">
      <label htmlFor="fetch-username" className="mb-2 block text-[12px] text-text-3">
        Insert your {label} username
      </label>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void runFetch();
        }}
      >
        <input
          id="fetch-username"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            if (error) setError(null);
          }}
          spellCheck={false}
          autoFocus
          placeholder={placeholder}
          className="h-9 w-full rounded-md border border-line bg-bg-2 px-3 text-[13px] text-text outline-none placeholder:text-text-3/70 focus:border-accent"
        />
        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-transparent bg-gradient-to-br from-accent-bright to-accent px-[15px] text-[13px] font-medium text-white shadow-[0_6px_18px_-8px_var(--accent)] hover:brightness-110 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Fetching…" : "Fetch"}
        </button>
      </form>

      {error && (
        <div className="mt-2 text-[12px]" style={{ color: "var(--c-blunder)" }}>
          {error}
        </div>
      )}
      {loading && (
        <div className="mt-2 text-[12px] text-text-3">Loading the last {GAME_LIMIT} games…</div>
      )}

      {games && (
        <div className="mt-3">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.09em] text-text-3">
            Last {games.length} games
          </div>
          <ul className="max-h-[340px] divide-y divide-line overflow-y-auto rounded-md border border-line bg-bg-2">
            {games.map((g, i) => (
              <GameRow key={`${g.endTime}-${i}`} game={g} onAnalyze={() => analyze(g)} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const OUTCOME_STYLE: Record<RecentGame["outcome"], { label: string; className: string }> = {
  won: { label: "Won", className: "bg-emerald-400/15 text-emerald-300" },
  lost: { label: "Lost", className: "bg-red-400/15 text-red-300" },
  draw: { label: "Draw", className: "bg-bg-3 text-text-3" },
};

function GameRow({ game, onAnalyze }: { game: RecentGame; onAnalyze: () => void }) {
  const outcome = OUTCOME_STYLE[game.outcome];
  const date = new Date(game.endTime * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  return (
    <li className="flex items-center gap-2.5 px-3 py-2">
      <span className="w-[84px] shrink-0 text-[11.5px] tabular-nums text-text-3">{date}</span>
      <span
        className={`w-[46px] shrink-0 rounded-[5px] px-1.5 py-0.5 text-center text-[11px] font-semibold ${outcome.className}`}
      >
        {outcome.label}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-text">
        {game.white} <span className="text-text-3">vs</span> {game.black}
      </span>
      <span
        className={`w-[52px] shrink-0 rounded-[5px] border px-1.5 py-0.5 text-center text-[10px] font-semibold tracking-wide ${
          game.userSide === "white"
            ? "border-line-2 bg-[oklch(0.95_0.005_288)] text-[oklch(0.18_0.02_288)]"
            : "border-line-2 bg-[oklch(0.18_0.02_288)] text-[oklch(0.95_0.005_288)]"
        }`}
      >
        {game.userSide === "white" ? "WHITE" : "BLACK"}
      </span>
      <button
        type="button"
        onClick={onAnalyze}
        className="h-7 shrink-0 rounded-md border border-transparent bg-gradient-to-br from-accent-bright to-accent px-2.5 text-[11.5px] font-medium text-white hover:brightness-110 active:translate-y-px"
      >
        Analyze
      </button>
    </li>
  );
}
```

- [ ] **Step 2: Delete the old panel**

```bash
git rm src/components/landing/chesscom-panel.tsx
```

(The next task updates `landing-screen.tsx`, the only importer.)

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/fetch-panel.tsx
git commit -m "feat: shared FetchPanel for chess.com and Lichess"
```

---

## Task 8: Landing screen — third source, wired modes, history, nav

**Files:**
- Modify: `src/components/landing/landing-screen.tsx`

Verify via typecheck/lint at the end.

- [ ] **Step 1: Update imports and state**

Replace the import block (lines importing `ChesscomPanel`, `parsePgn`, `savePendingPgn`) with:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GmbitLogo } from "@/components/logo";
import { FetchPanel } from "@/components/landing/fetch-panel";
import { parsePgn } from "@/lib/chess-game";
import { fetchRecentGames } from "@/lib/chesscom";
import { fetchLichessGames } from "@/lib/lichess";
import { savePendingMeta, savePendingMode, savePendingPgn } from "@/lib/pending-game";
import { clearHistory, loadHistory, recordAnalysis, type HistoryEntry } from "@/lib/history";
import type { AnalysisMode } from "@/types/analysis";

type Source = "pgn" | "chesscom" | "lichess";
```

Inside `LandingScreen`, replace the state declarations with:

```tsx
  const router = useRouter();
  const [source, setSource] = useState<Source | null>(null);
  const [mode, setMode] = useState<AnalysisMode>("deep");
  const [pgn, setPgn] = useState("");
  const [pgnError, setPgnError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    setHistory(loadHistory(window.localStorage));
  }, []);
```

- [ ] **Step 2: Persist mode + meta in analyzePgn**

Replace the body of `analyzePgn` (the `savePendingPgn(...); router.push("/analyze");` tail) so the success path reads:

```tsx
    savePendingPgn(window.sessionStorage, trimmed);
    savePendingMode(window.sessionStorage, mode);
    savePendingMeta(window.sessionStorage, { source: "pgn" });
    router.push("/analyze");
```

- [ ] **Step 3: Add a history re-open handler**

Add inside `LandingScreen`, after `analyzePgn`:

```tsx
  const reopen = (entry: HistoryEntry) => {
    savePendingPgn(window.sessionStorage, entry.pgn);
    savePendingMode(window.sessionStorage, mode);
    savePendingMeta(window.sessionStorage, { source: entry.source, outcome: entry.outcome });
    router.push("/analyze");
  };

  const clearAll = () => {
    clearHistory(window.localStorage);
    setHistory([]);
  };
```

- [ ] **Step 4: Add the nav link**

Immediately inside the outer `<div className="app-root ...">` (before `<main>`), add a top bar:

```tsx
      <div className="flex w-full items-center justify-end px-7 py-4">
        <Link
          href="/features"
          className="text-[13px] font-medium text-text-2 transition-colors hover:text-text"
        >
          How it works →
        </Link>
      </div>
```

- [ ] **Step 5: Wire the mode toggle**

Replace the two mode buttons (the `Fast analysis` / `In-depth analysis` block) with selected-state buttons:

```tsx
          {/* Analysis mode picker */}
          <div className="mt-3 grid w-full grid-cols-2 gap-3">
            <ModeButton
              selected={mode === "fast"}
              onClick={() => setMode("fast")}
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-amber-300">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              }
              label="Fast analysis"
            />
            <ModeButton
              selected={mode === "deep"}
              onClick={() => setMode("deep")}
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-amber-300">
                  <circle cx="11" cy="11" r="7" />
                  <line x1="21" y1="21" x2="16" y2="16" />
                </svg>
              }
              label="In-depth analysis"
            />
          </div>
```

- [ ] **Step 6: Replace the source detail panels**

Replace the `{source === "pgn" && ( ... )}` and `{source === "chesscom" && <ChesscomPanel .../>}` blocks with the PGN block (unchanged) plus both fetch panels:

```tsx
          {source === "chesscom" && (
            <FetchPanel
              key="chesscom"
              source="chesscom"
              label="chess.com"
              placeholder="e.g. hikaru"
              fetchGames={fetchRecentGames}
              mode={mode}
            />
          )}
          {source === "lichess" && (
            <FetchPanel
              key="lichess"
              source="lichess"
              label="Lichess"
              placeholder="e.g. DrNykterstein"
              fetchGames={fetchLichessGames}
              mode={mode}
            />
          )}
```

(Leave the existing `{source === "pgn" && (...)}` textarea block as-is.)

- [ ] **Step 7: Add the Lichess source card**

Change the source-picker grid to three columns and add a third card. Replace the grid wrapper `className` `grid-cols-1 gap-3 sm:grid-cols-2` with `grid-cols-1 gap-3 sm:grid-cols-3`, and add after the PGN `SourceCard`:

```tsx
            <SourceCard
              selected={source === "lichess"}
              onClick={() => setSource("lichess")}
              icon={
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-text">
                  <path d="M12 2l2 5 5 1-4 3 1.5 6L12 14l-4.5 3L9 11 5 8l5-1 2-5z" />
                </svg>
              }
              title="Fetch from Lichess"
              description="Pull your recent games with just a username."
            />
```

- [ ] **Step 8: Add the Recent analyses section**

Add after the source detail panels (before the closing `</div>` of the `max-w-[640px]` container):

```tsx
          {history.length > 0 && (
            <div className="mt-8 w-full">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-text-3">
                  Recent analyses
                </span>
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-[11.5px] text-text-3 hover:text-text"
                >
                  Clear
                </button>
              </div>
              <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-bg-1">
                {history.map((entry) => (
                  <li key={entry.pgn} className="flex items-center gap-2.5 px-3 py-2">
                    <span className="w-[44px] shrink-0 text-[10.5px] font-semibold uppercase tracking-wide text-text-3">
                      {entry.source}
                    </span>
                    <button
                      type="button"
                      onClick={() => reopen(entry)}
                      className="min-w-0 flex-1 truncate text-left text-[12.5px] text-text hover:text-accent-bright"
                    >
                      {entry.white} <span className="text-text-3">vs</span> {entry.black}
                    </button>
                    <span className="shrink-0 text-[11px] tabular-nums text-text-3">
                      {new Date(entry.date).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
```

- [ ] **Step 9: Add the ModeButton helper**

Add at the bottom of the file (next to `SourceCard`):

```tsx
function ModeButton({
  selected,
  onClick,
  icon,
  label,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-md border text-[12.5px] font-medium transition-[border-color,background-color] ${
        selected
          ? "border-accent bg-accent/15 text-text"
          : "border-line bg-bg-1 text-text hover:border-line-2"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
```

- [ ] **Step 10: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS — no remaining reference to `ChesscomPanel`.

- [ ] **Step 11: Commit**

```bash
git add src/components/landing/landing-screen.tsx
git commit -m "feat: Lichess source, wired analysis modes, recent-analyses list, nav link"
```

---

## Task 9: Analyze screen + client — receive mode, record history

**Files:**
- Modify: `src/components/analysis/analysis-screen.tsx`
- Modify: `src/app/analyze/analyze-client.tsx`

- [ ] **Step 1: Add a mode prop to AnalysisScreen**

In `src/components/analysis/analysis-screen.tsx`, add the import:

```tsx
import type { AnalysisMode } from "@/types/analysis";
```

Add `mode` to `Props`:

```tsx
interface Props {
  initialGame?: AnalysisGame;
  recentGames?: PendingFetch;
  activePgn?: string;
  onSelectGame?: (g: RecentGame) => void;
  /** Engine effort chosen on the landing page; defaults to deep. */
  mode?: AnalysisMode;
}
```

Destructure it with a default and pass it to the hook. Change the signature to `export function AnalysisScreen({ initialGame, recentGames, activePgn, onSelectGame, mode = "deep" }: Props) {` and change the hook call to:

```tsx
  } = useGameAnalysis(game, mode);
```

- [ ] **Step 2: Read mode + meta and record history in AnalyzeClient**

In `src/app/analyze/analyze-client.tsx`, extend the imports:

```tsx
import {
  clearPendingPgn,
  loadPendingFetch,
  loadPendingMeta,
  loadPendingMode,
  loadPendingPgn,
  savePendingMeta,
  savePendingPgn,
  type PendingFetch,
  type PendingMeta,
} from "@/lib/pending-game";
import { recordAnalysis, type HistorySource } from "@/lib/history";
import type { AnalysisMode } from "@/types/analysis";
```

(`clearPendingPgn` is imported here so it is available; it is used by the features page in Task 10. If lint flags it as unused in this file, drop it from this import — it is also exported for Task 10's island.)

Extend the `Loaded` interface:

```tsx
interface Loaded {
  game: AnalysisGame | undefined;
  pgn: string | null;
  fetch: PendingFetch | null;
  mode: AnalysisMode;
  meta: PendingMeta | null;
}
```

Add a history-recording helper above the component:

```tsx
function record(game: AnalysisGame, pgn: string, source: HistorySource, outcome?: PendingMeta["outcome"]) {
  recordAnalysis(window.localStorage, {
    pgn,
    white: game.headers.White?.trim() || "White",
    black: game.headers.Black?.trim() || "Black",
    outcome,
    source,
    date: Date.now(),
  });
}
```

Replace the mount effect so it reads mode/meta and records the loaded game:

```tsx
  useEffect(() => {
    const pgn = loadPendingPgn(window.sessionStorage);
    const meta = loadPendingMeta(window.sessionStorage);
    let game: AnalysisGame | undefined;
    if (pgn) {
      try {
        game = parsePgn(pgn);
      } catch {
        // Stored PGN no longer parses — fall back to the demo game.
      }
    }
    if (game && pgn) record(game, pgn, meta?.source ?? "pgn", meta?.outcome);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot read from sessionStorage on mount
    setLoaded({
      game,
      pgn: game ? pgn : null,
      fetch: loadPendingFetch(window.sessionStorage),
      mode: loadPendingMode(window.sessionStorage),
      meta,
    });
  }, []);
```

Update `selectGame` to persist meta and record history:

```tsx
  const selectGame = (g: RecentGame) => {
    if (g.pgn === loaded.pgn) return;
    let game: AnalysisGame;
    try {
      game = parsePgn(g.pgn);
    } catch {
      return; // unparseable PGN — keep the current game
    }
    savePendingPgn(window.sessionStorage, g.pgn);
    const source = loaded.fetch?.source ?? "chesscom";
    savePendingMeta(window.sessionStorage, { source, outcome: g.outcome });
    record(game, g.pgn, source, g.outcome);
    setLoaded({ ...loaded, game, pgn: g.pgn });
  };
```

Pass `mode` to the screen:

```tsx
  return (
    <AnalysisScreen
      key={loaded.pgn ?? "demo"}
      initialGame={loaded.game}
      recentGames={loaded.fetch ?? undefined}
      activePgn={loaded.pgn ?? undefined}
      onSelectGame={selectGame}
      mode={loaded.mode}
    />
  );
```

- [ ] **Step 3: Typecheck, lint, test**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: PASS. (If `clearPendingPgn` is reported unused here, remove it from this file's import — it is exported from `pending-game.ts` for the features island.)

- [ ] **Step 4: Commit**

```bash
git add src/components/analysis/analysis-screen.tsx src/app/analyze/analyze-client.tsx
git commit -m "feat: carry analysis mode into /analyze and record history"
```

---

## Task 10: Features page

**Files:**
- Create: `src/app/features/try-example-button.tsx`
- Create: `src/app/features/page.tsx`

- [ ] **Step 1: Create the demo button island**

Create `src/app/features/try-example-button.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { clearPendingPgn, savePendingMeta, savePendingMode } from "@/lib/pending-game";

/**
 * Opens the bundled demo game: clearing the pending PGN makes /analyze fall
 * back to its built-in demo, which is pre-annotated (no engine run needed).
 */
export function TryExampleButton() {
  const router = useRouter();
  const open = () => {
    clearPendingPgn(window.sessionStorage);
    savePendingMode(window.sessionStorage, "deep");
    savePendingMeta(window.sessionStorage, { source: "demo" });
    router.push("/analyze");
  };
  return (
    <button
      type="button"
      onClick={open}
      className="inline-flex h-10 items-center gap-2 rounded-md border border-transparent bg-gradient-to-br from-accent-bright to-accent px-5 text-[13.5px] font-medium text-white shadow-[0_6px_18px_-8px_var(--accent)] hover:brightness-110 active:translate-y-px"
    >
      Try an example game →
    </button>
  );
}
```

- [ ] **Step 2: Create the page**

Create `src/app/features/page.tsx`:

```tsx
import Link from "next/link";
import type { MoveClass } from "@/types/analysis";
import { CLS } from "@/lib/classification";
import { GmbitLogo } from "@/components/logo";
import { TryExampleButton } from "./try-example-button";

export const metadata = {
  title: "How it works — gmbit",
};

const CLASS_ORDER: MoveClass[] = [
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

export default function FeaturesPage() {
  return (
    <div className="app-root relative z-[1] min-h-screen overflow-y-auto">
      <header className="flex items-center justify-between px-7 py-4">
        <Link href="/" className="flex items-center gap-2">
          <GmbitLogo size={26} />
          <span className="text-[14px] font-semibold tracking-tight text-text">gmbit</span>
        </Link>
        <Link
          href="/"
          className="text-[13px] font-medium text-text-2 transition-colors hover:text-text"
        >
          ← Back to home
        </Link>
      </header>

      <main className="mx-auto w-full max-w-[760px] px-6 py-10">
        <h1 className="text-[32px] font-extrabold tracking-tight text-text">How gmbit works</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-text-2">
          Paste a PGN or pull your games from chess.com or Lichess. gmbit runs Stockfish
          locally in your browser, evaluates every position, and turns the numbers into
          plain-language feedback. Nothing is uploaded — the analysis happens on your machine.
        </p>

        <section className="mt-10">
          <h2 className="text-[18px] font-bold tracking-tight text-text">Move classifications</h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-text-2">
            Each move is graded by how much it changed your winning chances, from a brilliant
            sacrifice to an outright blunder.
          </p>
          <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {CLASS_ORDER.map((cls) => (
              <li
                key={cls}
                className="flex items-center gap-3 rounded-md border border-line bg-bg-1 px-3 py-2"
              >
                <span
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-[13px] font-bold"
                  style={{ background: `var(--c-${cls})`, color: CLS[cls].ink ?? "white" }}
                >
                  {CLS[cls].icon ? (
                    <span className="h-4 w-4">{CLS[cls].icon}</span>
                  ) : (
                    CLS[cls].sym
                  )}
                </span>
                <span className="text-[13.5px] font-medium text-text">{CLS[cls].label}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="text-[18px] font-bold tracking-tight text-text">Accuracy</h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-text-2">
            Each side gets an accuracy percentage derived from how much win probability was
            lost across all their moves — opening-book and already-lost positions are excluded
            so a single rough patch doesn&apos;t unfairly sink the score.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-[18px] font-bold tracking-tight text-text">Engine evaluation</h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-text-2">
            The eval bar and graph show Stockfish&apos;s assessment of each position in pawns
            (or forced-mate distance). The graph lets you jump straight to the moments where
            the evaluation swung. Choose <b className="text-text">Fast</b> analysis for a quick
            single pass, or <b className="text-text">In-depth</b> for a deeper two-pass review.
          </p>
        </section>

        <div className="mt-10">
          <TryExampleButton />
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck, lint, build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: PASS — `/features` compiles as a static route.

- [ ] **Step 4: Commit**

```bash
git add src/app/features/page.tsx src/app/features/try-example-button.tsx
git commit -m "feat: how-it-works features page with example-game launcher"
```

---

## Task 11: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: PASS — all existing + new lib tests green.

- [ ] **Step 2: Typecheck, lint, build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 3: Manual smoke (dev server)**

Run: `npm run dev`, then verify in the browser:
- Landing shows three source cards; "How it works →" links to `/features`.
- Fast / In-depth toggle reflects selection.
- chess.com and Lichess fetch a game list; "Analyze" opens it; the username is pre-filled on return.
- After analyzing, the game appears under "Recent analyses"; clicking it re-opens; "Clear" empties the list.
- `/features` renders all ten classification chips with their colors; "Try an example game" opens the demo in `/analyze`.
- Choosing "Fast" then analyzing visibly finishes quicker than "In-depth" (no second deep pass).

---

## Self-Review Notes

- **Spec coverage:** modes (Tasks 1, 2, 3, 8, 9), Lichess + remembered username (Tasks 4, 5, 7, 8), history (Tasks 6, 9, 8), features page (Task 10). All four spec sections map to tasks.
- **Type consistency:** `AnalysisMode` defined once in `types/analysis.ts`; `RecentGame` reused by `lichess.ts`; `HistorySource`/`PendingMeta.source` use the same string union; `searchTotal`/`MODE_CONFIG` names match between Task 2 and its test.
- **No engine-integration test for `useGameAnalysis`:** the hook drives WASM workers that can't run under vitest, matching the existing test file which only covers the pure `toPositionEval`. Mode behaviour is covered by the pure `searchTotal`/`MODE_CONFIG` tests plus the manual smoke step.
