# gmbit Logo Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stock white cburnett queen with an ownable faceted-queen mark, a matching dark-tile favicon, and a `<Wordmark>` component with "bit" in magenta.

**Architecture:** The mark lives in `src/components/logo.tsx` (`GmbitLogo`), drawn as a two-plane (light/dark magenta) faceted queen whose fills reference brand CSS tokens. A new `src/components/wordmark.tsx` centralizes the "gm"+magenta-"bit" brand text and replaces duplicated plain-text labels. The favicon is a static `src/app/icon.svg` (Next's app-icon file convention) showing the queen on a dark rounded tile so it stays legible on light browser tabs.

**Tech Stack:** Next.js 16 (app router, non-standard build — see `AGENTS.md`), React 19, Tailwind v4 (`@theme inline` tokens in `globals.css`), Vitest (logic-only tests; no DOM harness installed).

**Testing note:** This work is visual SVG/markup with no React DOM test harness in the repo (no `@testing-library`/jsdom). Adding one is out of scope. The verification gate for every task is therefore: `npm run lint`, `npm run build` (must compile clean), plus a **visual check in a real browser**. This is deliberate, not a skipped TDD step — there is no meaningful unit assertion for "the queen looks right."

---

## File Structure

- **Modify** `src/app/globals.css` — add one `--accent-deep` token (the dark facet plane) and its `@theme inline` mapping.
- **Modify** `src/components/logo.tsx` — redraw `GmbitLogo` as the faceted queen. Public API (`{ size = 52 }`, square viewBox) unchanged so all call sites keep working.
- **Create** `src/components/wordmark.tsx` — `<Wordmark>` component ("gm" + magenta "bit").
- **Modify** `src/components/landing/landing-screen.tsx` — swap hero (~98) and footer brand (~300) to `<Wordmark>`.
- **Modify** `src/components/analysis/top-bar.tsx` — swap brand label (~28) to `<Wordmark>`.
- **Modify** `src/app/features/page.tsx` — swap brand label (~16) to `<Wordmark>`.
- **Create** `src/app/icon.svg` — favicon (dark tile + queen, literal hex).

---

## Task 1: Faceted queen mark

**Files:**
- Modify: `src/app/globals.css` (accent tokens block, ~line 11 and ~line 67)
- Modify: `src/components/logo.tsx` (whole `GmbitLogo` body)

- [ ] **Step 1: Add the dark-facet color token**

In `src/app/globals.css`, in the `:root` accent block (just after `--accent-bright`, ~line 12), add:

```css
  --accent-deep: oklch(0.50 0.17 var(--accent-h));
```

Then in the `@theme inline` block (just after `--color-accent-bright`, ~line 68), add:

```css
  --color-accent-deep: var(--accent-deep);
```

- [ ] **Step 2: Redraw the mark**

Replace the entire contents of `src/components/logo.tsx` with:

```tsx
// The gmbit queen mark — a faceted chess queen in brand magenta. The light
// plane is --accent-bright, the dark (right/inner) plane is --accent-deep, so
// the mark tracks the accent hue instead of hardcoding color. Shared by the
// top bar, landing page, and features page.
export function GmbitLogo({ size = 52 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="gmbit"
    >
      {/* light plane — the full queen silhouette */}
      <g fill="var(--accent-bright)">
        <circle cx="14" cy="16" r="3.4" />
        <circle cx="23" cy="12" r="3.4" />
        <circle cx="32" cy="10.5" r="3.6" />
        <circle cx="41" cy="12" r="3.4" />
        <circle cx="50" cy="16" r="3.4" />
        <path d="M14,18 L20,33 L23,15 L29,32 L32,13 L35,32 L41,15 L44,33 L50,18 L47,38 Q32,35 17,38 Z" />
        <path d="M17,40 Q15,48 19,52 L45,52 Q49,48 47,40 Q32,37 17,40 Z" />
        <path d="M14,54 Q32,51 50,54 Q53,57 50,61 L14,61 Q11,57 14,54 Z" />
      </g>
      {/* dark plane — the right/inner facets, giving the crystalline 3D read */}
      <g fill="var(--accent-deep)">
        <path d="M32,13 L35,32 L47,38 Q40,35.5 32,35 Z" />
        <path d="M32,37 Q40,37.5 47,40 Q49,48 45,52 L32,52 Z" />
        <path d="M32,51.5 Q41,51 50,54 Q53,57 50,61 L32,61 Z" />
      </g>
    </svg>
  );
}
```

- [ ] **Step 3: Verify it compiles and lints**

Run: `npm run lint && npm run build`
Expected: both succeed, no errors referencing `logo.tsx` or `globals.css`.

- [ ] **Step 4: Visual check at all four sizes**

Run: `npm run dev`, open the landing page (mark at 88), the analysis top-bar (52), and the features page (26). Confirm:
- the queen reads clearly as a chess queen at every size,
- the light/dark facet split is visible (not muddy) and sits on the right/inner side,
- proportions look right — if the crown jewels or base feel off, nudge the path
  coordinates and re-check. Do not move on until the 26px and 88px both look good.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css src/components/logo.tsx
git commit -m "feat: faceted queen logo mark in brand magenta"
```

---

## Task 2: Wordmark component

**Files:**
- Create: `src/components/wordmark.tsx`
- Modify: `src/components/landing/landing-screen.tsx` (hero ~98, footer ~300)
- Modify: `src/components/analysis/top-bar.tsx` (~28)
- Modify: `src/app/features/page.tsx` (~16)

- [ ] **Step 1: Create the component**

Create `src/components/wordmark.tsx`:

```tsx
// The gmbit wordmark: "gm" in the normal text color, "bit" in the magenta
// accent — tying the word to the queen mark and surfacing the GM + bit play.
// Pass `className` to control size/weight per call site (defaults match the
// previous inline styling).
export function Wordmark({
  className = "text-[13px] font-extrabold tracking-tight",
}: {
  className?: string;
}) {
  return (
    <span className={className}>
      <span className="text-text">gm</span>
      <span className="text-accent-bright">bit</span>
    </span>
  );
}
```

- [ ] **Step 2: Use it in the landing hero**

In `src/components/landing/landing-screen.tsx`, add the import alongside the existing logo import:

```tsx
import { Wordmark } from "@/components/wordmark";
```

Replace the hero heading (currently `<h1 className="mt-3 text-[40px] font-extrabold tracking-tight text-text">gmbit</h1>`, ~line 97-99) with:

```tsx
          <h1 className="mt-3">
            <Wordmark className="text-[40px] font-extrabold tracking-tight" />
          </h1>
```

- [ ] **Step 3: Use it in the landing footer**

In the same file, replace the footer brand text `gmbit` (~line 300, the one rendered next to the small `<GmbitLogo size={22} />`, NOT the "© … gmbit" copyright line ~310). Match its existing wrapper styling — replace the text node `gmbit` with:

```tsx
              <Wordmark className="text-[14px] font-semibold tracking-tight" />
```

If the surrounding element already sets font size/weight on `gmbit`, move those classes into the `className` prop here and keep the wrapper neutral. Leave the `© {new Date().getFullYear()} gmbit. All rights reserved.` line exactly as-is.

- [ ] **Step 4: Use it in the top-bar**

In `src/components/analysis/top-bar.tsx`, add:

```tsx
import { Wordmark } from "@/components/wordmark";
```

Replace `<span className="text-[13px] font-semibold tracking-tight text-text">gmbit</span>` (~line 28) with:

```tsx
          <Wordmark className="text-[13px] font-semibold tracking-tight" />
```

- [ ] **Step 5: Use it in the features brand**

In `src/app/features/page.tsx`, add:

```tsx
import { Wordmark } from "@/components/wordmark";
```

Replace `<span className="text-[14px] font-semibold tracking-tight text-text">gmbit</span>` (~line 16) with:

```tsx
          <Wordmark className="text-[14px] font-semibold tracking-tight" />
```

Leave the `<h1 ...>How gmbit works</h1>` heading (~line 27) unchanged — it's prose, not the brand label.

- [ ] **Step 6: Verify it compiles and lints**

Run: `npm run lint && npm run build`
Expected: both succeed. Grep check — `grep -rn ">gmbit<" src` should now return only the copyright/heading prose spots, not the brand labels.

- [ ] **Step 7: Visual check**

Run `npm run dev`; confirm "gm" is white and "bit" is magenta on the landing hero, top-bar, and features page, and that sizing matches what was there before (no layout shift).

- [ ] **Step 8: Commit**

```bash
git add src/components/wordmark.tsx src/components/landing/landing-screen.tsx src/components/analysis/top-bar.tsx src/app/features/page.tsx
git commit -m "feat: Wordmark component with magenta bit"
```

---

## Task 3: Favicon

**Files:**
- Create: `src/app/icon.svg`
- Reference: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/app-icons.md`

Background: Next's app-icon convention auto-wires a static `app/icon.svg` into `<head>` with `sizes="any"`; modern browsers prefer it over the legacy `favicon.ico`. The queen is magenta, so the icon puts it on a **dark rounded tile** to stay legible on light tabs. Literal hex is required (a static SVG file can't read the app's CSS tokens): tile `#1b1924`, light plane `#cf7cf0` (≈ accent-bright), dark plane `#8a3cc0` (≈ accent-deep).

- [ ] **Step 1: Confirm the file convention**

Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/app-icons.md` and confirm `app/` accepts a static `icon.svg`. (As of next 16.2.7 it does — `icon.(ico|jpg|jpeg|png|svg)`, valid location `app/**/*`.) If the convention differs in the installed version, follow the docs.

- [ ] **Step 2: Create the icon**

Create `src/app/icon.svg`:

```svg
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <rect width="64" height="64" rx="14" fill="#1b1924"/>
  <g fill="#cf7cf0">
    <circle cx="14" cy="16" r="3.4"/>
    <circle cx="23" cy="12" r="3.4"/>
    <circle cx="32" cy="10.5" r="3.6"/>
    <circle cx="41" cy="12" r="3.4"/>
    <circle cx="50" cy="16" r="3.4"/>
    <path d="M14,18 L20,33 L23,15 L29,32 L32,13 L35,32 L41,15 L44,33 L50,18 L47,38 Q32,35 17,38 Z"/>
    <path d="M17,40 Q15,48 19,52 L45,52 Q49,48 47,40 Q32,37 17,40 Z"/>
    <path d="M14,54 Q32,51 50,54 Q53,57 50,61 L14,61 Q11,57 14,54 Z"/>
  </g>
  <g fill="#8a3cc0">
    <path d="M32,13 L35,32 L47,38 Q40,35.5 32,35 Z"/>
    <path d="M32,37 Q40,37.5 47,40 Q49,48 45,52 L32,52 Z"/>
    <path d="M32,51.5 Q41,51 50,54 Q53,57 50,61 L32,61 Z"/>
  </g>
</svg>
```

- [ ] **Step 3: Build and check the tab**

Run: `npm run build && npm run dev`
Open the app and look at the **browser tab** (hard-refresh / new tab to bust the cached old favicon). Confirm the queen on the dark tile is recognizable at 16px.

- [ ] **Step 4: Detail fallback decision (by eye)**

If the light/dark facets blur into one blob at 16px, flatten the favicon: delete the
`fill="#8a3cc0"` group from `icon.svg` and change the light group's fill to a single
mid magenta `#bf63e0`. (The in-app `GmbitLogo` stays faceted regardless.) Re-check the
tab. Keep whichever reads better.

- [ ] **Step 5: Commit**

```bash
git add src/app/icon.svg
git commit -m "feat: faceted queen favicon on dark tile"
```

Note: the legacy `src/app/favicon.ico` (old stock queen) is left in place as a fallback for browsers that ignore SVG icons; regenerating the `.ico` requires an image tool and is out of scope. Modern browsers use `icon.svg`.

---

## Self-Review

- **Spec coverage:** Mark → Task 1; favicon (+ flat fallback + non-standard-Next caveat) → Task 3; Wordmark ("bit" magenta) + all four call sites → Task 2; copyright/heading left as prose → Task 2 Steps 3 & 5. Out-of-scope (board piece set) untouched. ✔
- **Placeholder scan:** All code shown in full; no TBD/TODO. ✔
- **Type/name consistency:** `GmbitLogo({ size })` API preserved; `Wordmark({ className })` used consistently across all four call sites; CSS token `--accent-deep`/`--color-accent-deep` referenced as `var(--accent-deep)` in logo.tsx. ✔
