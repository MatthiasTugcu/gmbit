# Home Page Functionality — Design

Date: 2026-06-13

## Goal

Make the gmbit landing page do more useful work. Four additions, scoped to a
single implementation pass:

1. Wire up the Fast / In-depth analysis mode picker (currently inert).
2. Add Lichess as a second fetch source and remember the last username per source.
3. Show recent analyses (local history) on the home page for one-click re-open.
4. Move "what gmbit does" content into a dedicated features page, linked from home.

## Non-goals

- Caching computed engine evaluations between sessions (history re-analyzes).
- Account/login, server-side storage, or cross-device sync.
- Changing the analysis algorithm itself beyond exposing depth/pass knobs.

---

## 1. Analysis modes

Today `src/lib/engine/use-game-analysis.ts` hardcodes the search:
`BASE_DEPTH = 14`, `REFINE_DEPTH = 20`, `MULTI_PV = 2`, `REFINE_MOVETIME_MS = 5000`,
run as a base pass over every position followed by a deep pass over non-book
targets.

### Design

Introduce an `AnalysisMode` and a config map:

```ts
export type AnalysisMode = "fast" | "deep";

interface ModeConfig {
  baseDepth: number;
  refineDepth: number | null; // null = skip the deep pass
  multiPv: number;
  refineMovetimeMs: number;
}

const MODE_CONFIG: Record<AnalysisMode, ModeConfig> = {
  fast: { baseDepth: 14, refineDepth: null, multiPv: 1, refineMovetimeMs: 0 },
  deep: { baseDepth: 14, refineDepth: 20, multiPv: 2, refineMovetimeMs: 5000 },
};
```

- **Fast**: single base pass only (no deep refine), multiPV 1. ~3–4× quicker,
  rougher accuracy. `totalSearches` = `game.fens.length` (no refinement targets).
- **Deep** (default): exactly today's behavior.

`useGameAnalysis(game)` becomes `useGameAnalysis(game, mode: AnalysisMode = "deep")`.
When `refineDepth` is `null`, skip the second `runPass` and exclude refinement
targets from the progress total. multiPV comes from the mode (classification
needs the top line regardless; multiPV 2 only improves "only move" detection).

### Threading the choice

- Landing page mode picker becomes a real two-button toggle with selected state,
  defaulting to **deep**.
- The chosen mode is persisted to sessionStorage alongside the PGN via a new
  `savePendingMode` / `loadPendingMode` pair in `pending-game.ts` (value validated
  against the two known modes; defaults to `deep`).
- `AnalyzeClient` reads the mode on mount and passes it into `AnalysisScreen` →
  `useGameAnalysis`. Re-opening a recent/other game keeps the active mode.

---

## 2. Lichess source + remembered username

### Lichess client

New `src/lib/lichess.ts`, reusing the existing `RecentGame` shape from
`chesscom.ts` (re-export the type or import it). Endpoint:

```
GET https://lichess.org/api/games/user/{user}?max=100&pgnInJson=true
Accept: application/x-ndjson
```

CORS-enabled, no auth for public games. Response is newline-delimited JSON, one
game per line, newest first. Each line has `players.white.user.name`,
`players.black.user.name`, `winner` ("white" | "black" | absent for draw), `pgn`,
`lastMoveAt` (ms), and `speed`. Map to `RecentGame`:

- `endTime` = `lastMoveAt / 1000`
- `userSide` = which side's username matches (case-insensitive)
- `outcome` = `won` if `winner === userSide`, `draw` if no winner, else `lost`
- `timeClass` = `speed`
- Skip lines without a `pgn` or where the user isn't a player.

404 / non-OK handling mirrors `fetchRecentGames` (clear "no player named X" /
"lichess returned NNN" messages). Anonymous players (no `user.name`, e.g. some
bots) are handled by treating missing names as non-matching.

### Shared fetch panel

Generalize the current `ChesscomPanel` into `src/components/landing/fetch-panel.tsx`:

```ts
interface FetchPanelProps {
  source: "chesscom" | "lichess";
  label: string;                       // "chess.com" | "Lichess"
  fetchGames: (user: string, limit: number) => Promise<RecentGame[]>;
  placeholder: string;                 // "e.g. hikaru" | "e.g. DrNykterstein"
}
```

It owns username state, fetch/loading/error state, the game list, and the
analyze handoff (`savePendingPgn` + `savePendingFetch`). The chess.com-specific
panel collapses to a thin wrapper passing `fetchRecentGames`; Lichess passes the
new `fetchLichessGames`. `PendingFetch` gains an optional `source` field so the
analyze sidebar can label where the games came from (backward compatible — absent
means chess.com).

### Remember username

Add `src/lib/landing-prefs.ts` with `loadUsername(source)` / `saveUsername(source, name)`
backed by `localStorage` (keys `gmbit.username.chesscom`, `gmbit.username.lichess`).
The panel seeds its input from `loadUsername(source)` on mount and saves on a
successful fetch. Storage failures are swallowed (private mode safe).

### Source picker

Third `SourceCard` "Fetch from Lichess" added to the landing grid (grid becomes
three columns on `sm`, stacking on mobile). Selecting it renders the Lichess
`FetchPanel`.

---

## 3. Recent analyses (local history)

### Storage

New `src/lib/history.ts`:

```ts
export interface HistoryEntry {
  pgn: string;
  white: string;
  black: string;
  outcome?: "won" | "lost" | "draw"; // present when opened from a fetch
  source: "chesscom" | "lichess" | "pgn" | "demo";
  date: number; // ms, when analyzed
}

export function recordAnalysis(entry: HistoryEntry): void; // localStorage, dedup by pgn, cap 15, newest first
export function loadHistory(): HistoryEntry[];
export function clearHistory(): void;
```

Cap at the 15 most recent; dedup by exact PGN (re-opening moves the entry to the
front and refreshes its date). All reads/writes guarded against storage errors.

### Recording

`AnalyzeClient` records an entry whenever it loads or switches to a game. It
derives `white`/`black` from the parsed game headers; `source`/`outcome` come from
the `RecentGame` when available (chess.com/lichess) or default to `pgn` / `demo`.
To avoid coupling, the source + outcome are stashed in sessionStorage at handoff
time (extend `savePendingPgn`'s callers, or add a small `savePendingMeta`), with a
sensible fallback when absent.

### Display

A "Recent analyses" section on the landing page, shown below the source picker
when history is non-empty. Each row: players, outcome badge (when known), source
icon, relative date, and a re-open action that writes the PGN to sessionStorage
and routes to `/analyze`. A small "Clear" control empties the list. Hidden
entirely when there's no history (no empty-state clutter for first-time users).

---

## 4. Features page

New route `src/app/features/page.tsx` (server component is fine; any interactive
demo button is a small client island). Titled "How it works". Sections:

- **Move classifications** — the brilliant / great / best / good / inaccuracy /
  mistake / blunder / book set, rendered with the real icons and colors from
  `src/lib/classification.tsx` and `src/components/analysis/icons.tsx` so the page
  stays in sync with the analyzer's visual language.
- **Accuracy** — short explanation of the per-side accuracy score and that it's
  derived from win-probability loss per move.
- **Engine evaluation** — what the eval bar / graph shows and that Stockfish runs
  locally in the browser.
- **Try an example game** — button that writes the bundled demo PGN to
  sessionStorage and routes to `/analyze` (reusing the demo game from
  `src/data/demo-game.ts`).

The landing page gets a minimal top-right nav link ("How it works →") routing to
`/features`; the features page links back to home. The landing page stops
carrying explainer content itself, staying focused on getting into analysis.

---

## Files

New:
- `src/lib/lichess.ts`
- `src/lib/landing-prefs.ts`
- `src/lib/history.ts`
- `src/components/landing/fetch-panel.tsx`
- `src/app/features/page.tsx` (+ a small client island if the demo button needs one)

Modified:
- `src/lib/engine/use-game-analysis.ts` — mode config + signature
- `src/lib/pending-game.ts` — pending mode + (source/outcome) meta
- `src/components/landing/landing-screen.tsx` — third source, wired modes, history, nav link
- `src/components/landing/chesscom-panel.tsx` — collapse onto `FetchPanel` (or remove)
- `src/app/analyze/analyze-client.tsx` — read mode, record history, pass mode down
- `src/components/analysis/analysis-screen.tsx` — accept + forward `mode`

## Testing

- `lichess.ts`: ndjson parsing, side/outcome mapping, draw (no winner), missing
  pgn / anonymous player skips, 404 message — mirroring `chesscom.test.ts`.
- `history.ts`: dedup-and-promote, cap at 15, newest-first ordering, storage-error
  safety.
- `landing-prefs.ts`: round-trip per source, storage-error safety.
- `pending-game.ts`: mode round-trip + default/validation for unknown values.
- `use-game-analysis.ts`: fast mode skips the deep pass and sets the progress
  total to the base-pass count (extend existing engine tests with a stubbed pool).

## Risks / notes

- Lichess rate-limits; a 429 should surface a friendly "slow down" message.
- localStorage quota: PGNs are small, 15-entry cap keeps history well within limits;
  all writes already fail safe.
- Keep `RecentGame` as the single shared shape so the analyze sidebar works
  unchanged for both providers.
