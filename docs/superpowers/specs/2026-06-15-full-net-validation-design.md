# Phase 2 — Validate the full-net accuracy gain

**Date:** 2026-06-15
**Status:** Approved, ready for implementation plan
**Context:** Phase 2 of the analysis-correctness roadmap. Phase 1 (multi-threaded
Stockfish on `/analyze`, lite net) is shipped and browser-validated at 4.6× nps.

## Problem

The roadmap assumed the full NNUE net would be a ~40MB asset and "the bulk of the
correctness gain." Inspection of `node_modules/stockfish/bin` shows the real
full-threaded build (`stockfish-18.wasm`) is **108MB** — it embeds both the big
and small nets plus code. There is no intermediate "big-net-only" build between
the 6.8MB lite and the 108MB full.

108MB is a heavy one-time download even when lazy-loaded and cached. Before
building any delivery mechanism for it, we need evidence that the full net
actually produces accuracy estimates meaningfully closer to chess.com than the
lite net already does. The math layer is already calibrated to chess.com (see
the GM-dataset calibration: MAE ≈ 5 on accuracy); the open question is whether
*engine strength* (net quality) is the remaining bottleneck or a rounding error.

## Goal

Decide, with measured MAE/bias against chess.com labels, whether to ship the
108MB full net — **before** committing engineering effort to its delivery.

## Method

Extend `scripts/calibrate-gm.ts` minimally. It already:
- evaluates positions through a 6-worker Stockfish pool (Node child processes
  speaking UCI over stdin/stdout),
- caches evals as NDJSON keyed by `fen|d{DEPTH}|mpv{MULTI_PV}`,
- reports MAE / bias / RMSE vs chess.com `targets.json`, overall and per
  segment (rating band, time-control class, length bucket),
- refits `k / floor / hopeless / blend` via a parameter sweep with a stratified
  train/holdout split.

The only engine-specific line is the spawned binary name
(`public/engine/stockfish-18-lite-single.js`). The full single-threaded build
(`stockfish-18-single.js`) ships in `node_modules/stockfish/bin` and can be
copied into `public/engine/` alongside the lite ones.

### Changes

1. **`--net lite|full` flag** — selects the spawned binary:
   - `lite` → `public/engine/stockfish-18-lite-single.js` (current default)
   - `full` → `public/engine/stockfish-18-single.js` (+ its `.wasm`)
2. **Net-aware cache key** — so lite and full evals coexist in one NDJSON
   without collision. To keep the existing 18MB lite cache at
   `/tmp/gmbit-eval-cache-gm.ndjson` valid, `lite` keys stay **suffix-free**
   (current format `fen|d{DEPTH}|mpv{MULTI_PV}`) and only `full` carries a
   suffix (`fen|d{DEPTH}|mpv{MULTI_PV}|full`). No rewrite or invalidation of the
   existing cache.
3. Everything downstream (accuracy math, segment reports, the sweep) is
   unchanged — the net only changes the eval *values* feeding the same math.

Node-side validation uses the **single-threaded** full build, so no
SharedArrayBuffer, no COOP/COEP, and no pthread `stockfish.worker.js`
filename-collision concerns (those are app-only problems, deferred to Phase 3).

## What we measure

Dataset: the **current-model validation set** — the 80 games whose accuracy
labels come from today's chess.com model:
- `scripts/fixtures/lowrated-current` (60 games, ≤1350-rated players)
- `scripts/fixtures/` `games.pgn` + `targets.json` (20 recent games)

The 410-game `gm-sample` is **not** used in the first pass: its labels are the
June-2022 chess.com model (noisier signal for "closer to chess.com *today*")
and re-running the full net over it is an overnight job. It is the documented
fallback if the targeted result is borderline.

Runs, each evaluated at the shipped accuracy params **and** at refit params:

| Run            | Isolates                                   |
| -------------- | ------------------------------------------ |
| lite @ d20     | baseline (reuses existing cache)           |
| full @ d20     | **net effect only** (depth held constant)  |
| full @ d22     | the real In-depth config (net + deeper)    |

Refit answers the *best-case* full-net question: the shipped params were tuned
to lite-net evals, so a fair comparison must allow the full net its own optimum.
If full doesn't beat lite even after re-tuning, 108MB is definitely not worth it.

Reporting: MAE / bias / RMSE overall and per rating band, for each run.

## Decision rule

Ship the full net in a follow-up phase **only if** full @ d22 beats the lite @
d20 baseline by **≥ 1.0 MAE** on the current-model set, without worsening any
rating band. Below that threshold the 108MB download is not justified and the
roadmap pivots to "deeper lite" instead (raise deep-mode depth 20→22/24 and
possibly MultiPV 3, spending Phase 1's thread headroom — zero download cost).

## Compute

The full single-threaded net is slower per position than lite. The 80-game set
through the 6-worker pool is a couple-hours background run. Kicked off once and
reported once on completion — no periodic progress polling (standing
token-efficiency agreement). The run resumes from the NDJSON cache if
interrupted.

## Out of scope (gated on this result)

- The 108MB delivery itself: lazy-load, Cache API / service-worker caching,
  one-time download indicator.
- The app-side Fast/In-depth → net wiring in `landing-screen.tsx` /
  `use-game-analysis.ts` / `src/lib/engine/index.ts`.
- The threaded-full-build `stockfish.worker.js` filename collision with the
  threaded-lite build.

These are only built if the numbers clear the decision threshold.

## Success criteria

- `calibrate-gm.ts --net full` runs end-to-end and produces a comparable
  MAE/bias report against the same labels as the lite baseline.
- The three runs (lite d20, full d20, full d22) are reported side by side with
  current-params and refit-params MAE per rating band.
- A clear ship / don't-ship conclusion against the ≥1.0 MAE rule, written up so
  the result is recorded for the roadmap regardless of outcome.
