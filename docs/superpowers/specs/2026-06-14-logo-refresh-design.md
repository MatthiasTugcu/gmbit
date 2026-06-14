# gmbit logo refresh — design

**Date:** 2026-06-14
**Status:** Approved (design), pending implementation

## Problem

The current logo is the stock cburnett white chess queen — the same SVG every chess
site uses. It is generic, has no connection to the gmbit name (GM + gambit / GM + bit),
and ignores the app's dark/magenta brand. We want an ownable mark + lockup.

## Direction (decided during brainstorm)

- **Concept:** redesigned chess queen (not abstract crown, pixel, or monogram).
- **Execution:** **faceted** — the queen silhouette split into light/dark magenta planes
  for a crystalline, "computed / precise engine" feel.
- **Scope:** mark + favicon + wordmark (full lockup).

## 1. The mark — faceted queen

**File:** `src/components/logo.tsx` (`GmbitLogo` component).

- Replace the cburnett queen paths with a redrawn faceted queen: a queen silhouette
  (crown jewels, scalloped crown fan, waisted body, flared base) split into two planes.
- **Two magenta tones**, driven from brand CSS tokens so the mark tracks the accent hue
  rather than hardcoding hex:
  - light plane → `var(--accent-bright)`
  - dark plane → a deeper magenta. Add a token if one doesn't exist
    (e.g. `--accent-deep`) rather than inlining a literal; keep it in `globals.css`
    next to the other accent tokens.
- **Keep the public API unchanged:** `function GmbitLogo({ size = 52 })`, square
  `viewBox`. All existing call sites (top-bar 52, landing 88, features 26, footer 22)
  must keep working with no edits beyond what's described here.
- The rough faceted proportions from the brainstorm are a starting point; refine the
  path during implementation and verify visually (see Verification).

## 2. Favicon (browser tab)

The queen is magenta and would nearly vanish on a white/light browser tab, so the
favicon is **a dark rounded brand tile with the magenta queen on top** — legible and
branded at 16px.

- Ship an **SVG app icon** (crisp at all sizes) and keep an `.ico` fallback.
- **This Next.js is non-standard (see `AGENTS.md`).** Before adding/replacing icon
  files, read the relevant guide under `node_modules/next/dist/docs/` to confirm the
  current file-convention (e.g. `app/icon.svg`, `app/favicon.ico`) and metadata wiring.
  Do not assume the file layout from training data.
- **Detail fallback:** if the facets mush together at 16px, the favicon uses the
  flat single-tone queen on the tile while the in-app mark stays faceted. Decide this
  by eye at 16px during verification.

## 3. Wordmark

**New file:** `src/components/wordmark.tsx` exporting a `<Wordmark>` component.

- Renders "gm" in `text-text` and **"bit" in the magenta accent** (`text-accent` or
  equivalent token) — ties the word to the mark and surfaces the GM + *bit* wordplay.
- Preserves current type styling: `font-extrabold tracking-tight`. Accept a
  `className` (and/or size) prop so each call site sets its own font size, matching
  today's per-site sizing.
- **Replace the duplicated plain-text brand label** with `<Wordmark>` at:
  - `src/components/landing/landing-screen.tsx` hero (line ~98) and footer brand (~300)
  - `src/components/analysis/top-bar.tsx` (~28)
  - `src/app/features/page.tsx` brand (~16)
- **Leave as plain prose** (not the component): the "© {year} gmbit" copyright line
  (landing ~310) and the "How gmbit works" heading (features ~27).

## Out of scope

- No change to the cburnett **board piece set** used on the analysis board — this is
  only the brand logo/mark, not in-game pieces.
- No layout/spacing changes to the pages beyond swapping in the new components.

## Verification

- Render the new mark at all four sizes (22 / 26 / 52 / 88) and confirm it reads.
- Preview the favicon in an actual browser tab at 16px.
- Run the app and visually confirm the full lockup (mark + wordmark) on the landing
  page, top-bar, and features page before declaring done.
