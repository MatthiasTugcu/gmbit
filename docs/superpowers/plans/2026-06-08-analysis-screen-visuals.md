# Analysis Screen — VISUALS Phase Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the `design-handoff/` static React demo into the Next.js app as the main analysis screen, using Tailwind v4 tokens and TS components. No real chess logic, no engine — just visual fidelity with mock data.

**Architecture:**
- One client-side `<AnalysisScreen>` container owns local UI state (appearance, current ply for highlight/eval display). Children are mostly pure props-in components; client only where they need state/effects (popovers, hover, scroll-into-view).
- Theming preserves the design's two-axis system: `.mode-dark|light` class on the root for chrome, `data-board="violet|slate|green|walnut"` attr for square colors. Tailwind `@theme inline` exposes CSS vars as utility classes (`bg-app`, `text-text-2`, `rounded-md`, etc.) so JSX stays token-driven.
- For VISUALS, the board renders one hardcoded mid-game position via a small piece-map (no chess.js / no react-chessboard yet). LOGIC phase will swap that out without touching the styling tokens.

**Tech Stack:** Next.js 16 App Router, React 19 + Compiler, TypeScript, Tailwind v4 (`@tailwindcss/postcss`).

**Out of scope (LOGIC phase):** chess.js, react-chessboard, Stockfish/engine module, PGN import, move navigation wiring, drag-to-move, eval-bar/eval-graph data wiring, keyboard nav. The components will accept these as props with mock data injected for now.

---

## File Structure

```
src/
  app/
    globals.css                       # Modified: add design tokens + theme vars
    layout.tsx                        # Modified: drop default body classes
    page.tsx                          # Rewritten: render <AnalysisScreen />
  components/analysis/
    analysis-screen.tsx               # Client: top-level state container, layout
    top-bar.tsx                       # Client: wordmark + meta chips + appearance + import btn
    appearance-popover.tsx            # Client: mode/board/coords switcher (localStorage)
    players.tsx                       # Pure
    eval-readout.tsx                  # Pure
    class-bar.tsx                     # Pure (with legend variant)
    best-line.tsx                     # Pure
    move-list.tsx                     # Client: scroll-into-view effect
    accuracy.tsx                      # Pure
    controls.tsx                      # Client: onClick handlers (no-op for now)
    eval-bar.tsx                      # Pure
    eval-graph.tsx                    # Client: hover tooltip state
    board.tsx                         # Client: static render of a Frame, no interactions yet
    icons.tsx                         # Pure: shared SVG icons
  lib/
    eval-format.ts                    # formatEval, whiteShare, assessLabel
    classification.ts                 # CLS metadata + GRAPH_MARK set
  data/
    demo-game.ts                      # Opera Game move list + players + engine meta + ply-18 frame
  types/
    analysis.ts                       # Move, Frame, Players, Engine, Appearance types
```

**Why this split:** Each card on the right rail is its own file because the design treats them as independent units; same components will be drop-in receivers of real data in LOGIC. Lib/data/types are separated so LOGIC phase can replace `demo-game.ts` and `chess-frames` machinery without component edits.

---

## Token Strategy (the hinge)

The design defines a layered token system in `design-handoff/styles.css`:

1. **Mode-scoped vars** (`.mode-dark` / `.mode-light`): `--bg`, `--bg-1..3`, `--line`, `--line-2`, `--text`, `--text-2`, `--text-3`, `--shadow`, `--glow`, `--accent`, `--accent-bright`, `--accent-soft`, `--accent-line`, `--accent-h`.
2. **Board-scoped vars** (`[data-board=…]`): `--sq-light`, `--sq-dark`, `--hl`, `--hl2`, `--dot`, `--coord`.
3. **Move-class colors** (root, shared): `--c-brilliant|best|good|book|inaccuracy|mistake|blunder`.
4. **Radii / fonts**: `--r-sm|md|lg`, `--mono`, `--sans`.

**Translation to Tailwind:**

- Keep all the raw CSS vars in `globals.css` exactly as-is (copy verbatim from `styles.css`) — this preserves the mode/board cascade.
- Add a `@theme inline` block that maps them to Tailwind tokens:
  - Colors: `--color-app`, `--color-bg-1..3`, `--color-line`, `--color-line-2`, `--color-text`, `--color-text-2`, `--color-text-3`, `--color-accent`, `--color-accent-bright`, `--color-accent-soft`, `--color-accent-line`
  - Move-class colors: `--color-c-brilliant`, `--color-c-best`, etc. (so `bg-c-brilliant` works for badges)
  - Radii: `--radius-sm: 7px`, `--radius-md: 11px`, `--radius-lg: 16px`
  - Fonts: `--font-mono`, `--font-sans` already exist via Geist
- Square colors / hl / dot / coord stay as raw CSS vars used directly with `bg-[var(--sq-light)]` arbitrary-value classes — they're board-theme parametric and only consumed by `<Board>`, so utility-class generation isn't worth it.

**Why:** JSX writes `bg-bg-1`, `text-text-2`, `border-line`, `rounded-md` — token names match the design's mental model. No hex/oklch literals anywhere in components. Mode and board switching keeps working via root className/data-attr because the underlying CSS vars are reassigned.

---

## Task 1: Tokens + globals + layout chrome

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`
- Create: `src/types/analysis.ts`

- [ ] **Step 1: Replace `globals.css` content**
  - Keep the `@import "tailwindcss"` line.
  - Drop the existing minimal `--background/--foreground` block.
  - Copy verbatim from `design-handoff/styles.css`: the `:root` block (accent + move-class + radii + font vars), the `.mode-dark` block, the `.mode-light` block, the violet vignette `::before`, the four `[data-board=…]` blocks (just the vars — not the `.sq` rules, those become Tailwind), and the `@media (prefers-reduced-motion)` rule.
  - Add a single `@theme inline` block mapping every mode-scoped var to a Tailwind color token (`--color-app: var(--bg);` style). Also map radii: `--radius-sm: var(--r-sm);` etc.
  - Add a base layer: `html, body { height: 100%; margin: 0; }` and `body { @apply bg-app text-text font-sans antialiased overflow-hidden; }` (or equivalent without `@apply` — direct CSS).
  - Delete the default `body { background: var(--background); ... font-family: Arial }` block.

- [ ] **Step 2: Update `layout.tsx`**
  - Remove `min-h-full flex flex-col` from `<body>` — the analysis screen owns its own full-viewport layout.
  - Update `<title>` metadata to `"Gmbit — Game Analysis"`.
  - Body className stays minimal; mode/board attrs are applied by `<AnalysisScreen>` (its root div).

- [ ] **Step 3: Create `src/types/analysis.ts`**
  ```ts
  export type MoveClass =
    | 'brilliant' | 'best' | 'good' | 'book' | 'inaccuracy' | 'mistake' | 'blunder';
  export type Color = 'w' | 'b';
  export type Square = string; // 'e4' etc.
  export type PieceType = 'k' | 'q' | 'r' | 'b' | 'n' | 'p';

  export interface Move {
    n: number; c: Color; san: string; from: Square; to: Square;
    cls: MoveClass; cp?: number; mate?: number; note?: string;
    cap?: boolean; check?: boolean; mateMove?: boolean;
    castle?: { rookFrom: Square; rookTo: Square };
  }
  export interface Frame {
    pos: Record<string, Square>;          // pieceId -> square
    type: Record<string, PieceType>;      // pieceId -> piece type
    captured: Set<string>;                // pieceIds
  }
  export interface Players {
    white: { name: string; rating: number | null; side: 'White'; accuracy: number };
    black: { name: string; rating: number | null; side: 'Black'; accuracy: number };
    event: string; result: string; opening: string;
  }
  export interface Engine { name: string; kind: string; depth: number }
  export interface Appearance {
    mode: 'dark' | 'light';
    board: 'violet' | 'slate' | 'green' | 'walnut';
    coords: boolean;
  }
  ```

- [ ] **Step 4: Verify**
  - Run `npm run build`. Expected: succeeds (no components yet, but globals.css must parse).
  - If `@apply` in body block fails (Tailwind v4 sometimes ships without it), replace with plain CSS using `var(--bg)` etc.

- [ ] **Step 5: Commit**
  ```bash
  git add src/app/globals.css src/app/layout.tsx src/types/analysis.ts
  git commit -m "feat: add design tokens and type scaffolding for analysis screen"
  ```

---

## Task 2: Mock data + utilities

**Files:**
- Create: `src/data/demo-game.ts`
- Create: `src/lib/classification.ts`
- Create: `src/lib/eval-format.ts`

- [ ] **Step 1: Port `game.js` → `src/data/demo-game.ts`**
  - Copy the `moves` array (all 33 plies of the Opera Game) verbatim into typed form: `export const demoMoves: Move[] = [...]`.
  - Copy `players` and `engine` into `export const demoPlayers: Players` and `export const demoEngine: Engine`.
  - Add a hardcoded mid-game `Frame` for ply ~18 (after `9...b5`) as `export const demoFrame: Frame`. Build the position by mentally walking the moves OR by reading the design's `buildFrames` result via a quick node script. Pragmatic shortcut: temporarily inline `buildFrames` in a dev script, dump JSON, paste in. This is throwaway — LOGIC phase replaces with chess.js.
  - Also export `export const demoPly = 18` so the screen knows which move highlight to show.

- [ ] **Step 2: Port `util.js` → `src/lib/eval-format.ts` and `src/lib/classification.ts`**
  - `eval-format.ts`: `formatEval(cp?: number, mate?: number): string`, `whiteShare(cp?: number, mate?: number): number`, `assessLabel(cp?: number, mate?: number): string`. Direct port — same math.
  - `classification.ts`: export `CLS` (record from `MoveClass` to `{ label, sym, short }`) and `GRAPH_MARK: Set<MoveClass>`.

- [ ] **Step 3: Verify**
  - Run `npx tsc --noEmit`. Expected: passes.

- [ ] **Step 4: Commit**
  ```bash
  git add src/data src/lib
  git commit -m "feat: port demo game data and eval/classification helpers"
  ```

---

## Task 3: Static right-rail cards (Players, EvalReadout, ClassBar, BestLine, Accuracy)

**Files:**
- Create: `src/components/analysis/players.tsx`
- Create: `src/components/analysis/eval-readout.tsx`
- Create: `src/components/analysis/class-bar.tsx`
- Create: `src/components/analysis/best-line.tsx`
- Create: `src/components/analysis/accuracy.tsx`

All pure / no `"use client"`. Translation pattern:
- `.card` → `rounded-md border border-line bg-bg-1 p-[14px_15px]` (or define a `Card` wrapper if reused — but inline is fine, only 5 sites).
- `.card.tight` → `p-[12px_14px]`.
- `var(--text-3)` → `text-text-3`, etc.
- Move class colors use dynamic class via lookup: `const clsColor = \`text-c-\${cls}\`` (whitelisted in `tailwind` safelist? — Tailwind v4 with `@source inline` or just use `style={{ color: \`var(--c-\${cls})\` }}` to dodge purging). **Decision: use inline `style={{ color: 'var(--c-...)' }}`** for move-class colors — they're parametric, dynamic-class would require safelisting which is more friction than it's worth for 7 colors.

- [ ] **Step 1: `players.tsx`** — render two `.pl` rows (black on top, white below, mirroring design), result chip on the right with `.win` accent for the winning side.

- [ ] **Step 2: `eval-readout.tsx`** — score on the left (`text-[38px] font-semibold font-mono leading-none`), assess label + engine row on the right; `.nnue` chip is `border border-line rounded-[5px] px-[7px] py-[2px] text-text-2 font-mono text-[10.5px]`.

- [ ] **Step 3: `class-bar.tsx`** — props `{ move: Move | null; showLegend?: boolean }`. If `move` is null → "Starting position…" hint. Else: big circular badge (color via inline style `background: var(--c-${move.cls})`), name + move + note. Legend row when `showLegend`.

- [ ] **Step 4: `best-line.tsx`** — props `{ moves: Move[]; ply: number }`. Slice next 6 plies, render with move numbers and a `.hl` style on the first one.

- [ ] **Step 5: `accuracy.tsx`** — two-column grid, percent + track bar gradient `bg-gradient-to-r from-accent to-accent-bright`.

- [ ] **Step 6: Verify** — `npx tsc --noEmit`. Components don't render yet (no page wires them) — type-check is the gate.

- [ ] **Step 7: Commit**
  ```bash
  git add src/components/analysis
  git commit -m "feat: add static right-rail card components"
  ```

---

## Task 4: Interactive rail (MoveList, Controls) + Icons

**Files:**
- Create: `src/components/analysis/icons.tsx`
- Create: `src/components/analysis/move-list.tsx`
- Create: `src/components/analysis/controls.tsx`

- [ ] **Step 1: `icons.tsx`** — export `Icons` object with first/prev/next/last/flip/gear/import SVGs ported from `components-rail.jsx:Ico`. Each typed as `JSX.Element`. No `"use client"` needed.

- [ ] **Step 2: `controls.tsx`** — `"use client"`. Props `{ ply: number; total: number; onSeek: (p: number) => void; onFlip: () => void }`. Five buttons in a `.card.tight` flex row, disabled at boundaries. Active styling on hover (border + text accent).

- [ ] **Step 3: `move-list.tsx`** — `"use client"`. Props `{ moves: Move[]; ply: number; onSeek: (p: number) => void }`. Group plies into rows by move number, render `Ply` rows. `useEffect` watches `ply` and scrolls active row into view via refs. Badge dot uses inline `style={{ background: \`var(--c-\${cls})\` }}`.

- [ ] **Step 4: Verify** — `npx tsc --noEmit`.

- [ ] **Step 5: Commit**
  ```bash
  git add src/components/analysis/icons.tsx src/components/analysis/move-list.tsx src/components/analysis/controls.tsx
  git commit -m "feat: add interactive move list and controls"
  ```

---

## Task 5: Board (static render only)

**Files:**
- Create: `src/components/analysis/board.tsx`

This is a placeholder that LOGIC phase will swap for `react-chessboard`. For now it renders the design's custom Unicode-glyph board from a `Frame`.

- [ ] **Step 1: `board.tsx`** — `"use client"` (will gain pointer handlers in LOGIC; keeping client now avoids future churn).
  - Props: `{ frame: Frame; size: number; flip: boolean; showCoords: boolean; highlight?: { from: Square; to: Square } | null; checkSquare?: Square | null }`.
  - Render 64 `.sq` divs in flip-aware order. Light/dark via `bg-[var(--sq-light)]` / `bg-[var(--sq-dark)]`.
  - Overlays: `.lastmove` (from/to highlight), `.checkglow` (radial gradient), `.coord` (rank on col 0, file on row 7).
  - Pieces: absolutely positioned overlay with `translate(x,y)`. Glyph map `{ k:'\u265A', q:'\u265B', r:'\u265C', b:'\u265D', n:'\u265E', p:'\u265F' }`. Color derived from `id[1] <= 2 ? 'w' : 'b'`.
  - No drag, no click, no `genMoves` — those land in LOGIC. The piece divs have no `onPointerDown`.

- [ ] **Step 2: Verify** — `npx tsc --noEmit`.

- [ ] **Step 3: Commit**
  ```bash
  git add src/components/analysis/board.tsx
  git commit -m "feat: add static Board component rendering Frame positions"
  ```

---

## Task 6: EvalBar + EvalGraph

**Files:**
- Create: `src/components/analysis/eval-bar.tsx`
- Create: `src/components/analysis/eval-graph.tsx`

- [ ] **Step 1: `eval-bar.tsx`** — pure. Props `{ cp?: number; mate?: number; height: number }`. Outer relative div `bg-[oklch(0.20_0.02_288)]` (this dark-bar bg differs from `mode-light` — handle with a `dark:` style or just match design with both modes' rule). Use `[.mode-light_&]:bg-[oklch(0.30_0.01_288)]` Tailwind arbitrary selector.
  - White-fill div absolutely positioned bottom-up, `height: ${share*100}%`. Use inline style for the share — it's data-driven.
  - Label flips top/bot based on `whiteAhead`.

- [ ] **Step 2: `eval-graph.tsx`** — `"use client"`. Props `{ moves: Move[]; ply: number; height: number; onSeek: (p: number) => void }`. Local state for hover. SVG with center dashed line, area path, line path, classification dots (for marks in `GRAPH_MARK`), current-ply cursor. Tooltip card on hover (positioned via absolute + inline style). Click on SVG seeks via `seekFromY`.

- [ ] **Step 3: Verify** — `npx tsc --noEmit`.

- [ ] **Step 4: Commit**
  ```bash
  git add src/components/analysis/eval-bar.tsx src/components/analysis/eval-graph.tsx
  git commit -m "feat: add eval bar and vertical eval graph"
  ```

---

## Task 7: TopBar + AppearancePopover

**Files:**
- Create: `src/components/analysis/appearance-popover.tsx`
- Create: `src/components/analysis/top-bar.tsx`

- [ ] **Step 1: `appearance-popover.tsx`** — `"use client"`. Props `{ appearance: Appearance; setAppearance: (a: Appearance) => void }`. Local `open` state, ref for click-outside, popover panel containing:
  - Mode segmented control (Dark / Light).
  - Board theme swatch grid (4 options, mini square previews using inline `style={{ background: oklchVal }}` — values pulled from a local `BOARD_PREVIEWS` array).
  - Coordinates segmented control (Show / Hide).

- [ ] **Step 2: `top-bar.tsx`** — `"use client"` (because it includes the popover). Wordmark on left (gradient bg mark + "Gmbit." with violet dot), meta chips (event + opening), spacer, appearance gear button, primary "Import PGN" button.

- [ ] **Step 3: Verify** — `npx tsc --noEmit`.

- [ ] **Step 4: Commit**
  ```bash
  git add src/components/analysis/appearance-popover.tsx src/components/analysis/top-bar.tsx
  git commit -m "feat: add top bar with appearance popover"
  ```

---

## Task 8: Assemble AnalysisScreen + wire page

**Files:**
- Create: `src/components/analysis/analysis-screen.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: `analysis-screen.tsx`** — `"use client"`. State:
  - `appearance` via `useState`, lazy-init from `localStorage('gmbit.appearance')`, persisted on change via effect. Default `{ mode: 'dark', board: 'violet', coords: true }`.
  - `flip: boolean` via `useState(false)`. No persist.
  - `ply` is fixed to `demoPly` for VISUALS (no nav yet) — but exposed via prop pattern so LOGIC phase plugs in `useState`.
  - Hardcoded `size = 560`, `railH = 620` for now (responsive sizing is LOGIC-adjacent; matches design fallback).
  - Root div: `<div className={\`relative z-[1] h-screen flex flex-col mode-\${appearance.mode}\`} data-board={appearance.board}>`. Mount `<TopBar>` then a `.stage` flex container with the board cluster (EvalGraph + EvalBar + Board) and the right rail (Players, EvalReadout, ClassBar, BestLine, MoveList, Accuracy, Controls).
  - Wire mock seek/flip handlers as no-ops or local-state-only (flip toggles `flip` state; seek does nothing for now since `ply` is fixed).
  - Use `demoMoves`, `demoPlayers`, `demoEngine`, `demoFrame` from `@/data/demo-game`.
  - `curMove = demoMoves[demoPly - 1]`, `curEval = { cp: curMove.cp, mate: curMove.mate }`, `lastMove = { from: curMove.from, to: curMove.to }`.

- [ ] **Step 2: `page.tsx`** — rewrite to render the screen:
  ```tsx
  import { AnalysisScreen } from '@/components/analysis/analysis-screen';
  export default function Page() {
    return <AnalysisScreen />;
  }
  ```

- [ ] **Step 3: Run build**
  - `npm run build`. Expected: compiles, no TS errors, no Tailwind warnings.

- [ ] **Step 4: Run dev server and smoke-test in browser**
  - `npm run dev`, open `http://localhost:3000`.
  - Confirm: top bar renders with wordmark and chips; appearance popover opens on gear click, mode switch flips theme, board theme switch changes square colors, coord toggle hides/shows letters; board renders 32 Unicode pieces in the ply-18 position with from/to highlight on the last move; eval bar shows white-favoring fill; eval graph shows curve with classification dots; right rail shows all 6 cards with matching content; move list highlights ply 18; controls render (disabled per ply position since we're not wiring seek).
  - Note any visual mismatches vs `design-handoff/Gmbit Analysis.html` (open both side-by-side).

- [ ] **Step 5: Commit**
  ```bash
  git add src/components/analysis/analysis-screen.tsx src/app/page.tsx
  git commit -m "feat: wire AnalysisScreen into root route"
  ```

---

## Self-Review Checklist

- **Spec coverage:** VISUALS task lists 10 design components; plan creates 12 component files (TopBar split into TopBar + AppearancePopover; Icons extracted as shared). All design rail items + board cluster covered. ✓
- **No LOGIC bleed:** Plan does NOT install or import `chess.js`, `react-chessboard`, or `stockfish`. Does NOT wire move navigation, drag handlers, engine analysis, or PGN import. ✓
- **Token discipline:** All color usage routes through Tailwind tokens or CSS vars defined in `globals.css`. No inline hex/oklch in JSX except the data-parametric move-class colors (justified above). ✓
- **`"use client"` discipline:** Annotated only where state/effects/event handlers exist: TopBar, AppearancePopover, MoveList, Controls, Board, EvalGraph, AnalysisScreen. Pure: Players, EvalReadout, ClassBar, BestLine, Accuracy, EvalBar, icons.
- **Verification:** Each task ends with type-check or build; final task ends with browser smoke-test against the design HTML.
- **Reversibility:** All changes additive except `page.tsx` rewrite and `globals.css` overhaul. Pre-existing `page.tsx` is the Next.js default — no user content lost.

---

## Open Questions for the User (before execution)

1. **Should the default Next.js page content (`page.tsx`) be deleted, or moved to `/welcome`?** Plan assumes deletion since this is the main screen.
2. **For the demo `Frame`, OK to inline a JSON snapshot of position-after-ply-18?** Alternative: temporarily port `buildFrames` from `chess.js` (design), use it once, then drop in LOGIC. Inlining is simpler but less flexible if you want to preview a different ply during VISUALS dev.
3. **Light-mode parity:** Confirmed I should ship both `.mode-dark` and `.mode-light` so the appearance popover toggle works end-to-end?
