# Full-Net Validation — Results

**Date:** 2026-06-15
**Spec:** `2026-06-15-full-net-validation-design.md`
**Verdict: DO NOT ship the 108MB full net. The roadmap's "engine strength is the gap" thesis is falsified for the measurable band.**

## What was measured

Same games, same accuracy math, same depth/MultiPV — only the NNUE net differs
(lite 6.8MB vs full 108MB, both single-threaded, depth 20, MultiPV 2). Dataset:
`lowrated-current` (60 games, 120 sides, current chess.com labels, banded).

The depth-22 ("real In-depth config") runs were **started but cut short**: the
deep pass without a movetime cap let pathological positions run 30s–2min each,
dropping throughput to ~0.27 pos/s. They were stopped because the matched-depth
result below already settles the decision — d22 cannot plausibly overcome it.

## Net effect at matched depth 20 (lowrated-current)

| Net | MAE (shipped params) | MAE (refit) | bias |
| --- | --- | --- | --- |
| **Lite** | **5.78** | 5.14 | −0.72 |
| **Full** | **6.28** | 5.33 | −1.91 |

Per rating band, shipped params:

| Band | Lite MAE | Full MAE |
| --- | --- | --- |
| <1200 | 5.56 | 6.10 |
| 1200–1600 | 5.91 | 6.40 |

The full net is **worse by 0.50 MAE** at shipped params and **still 0.19 worse
after refitting params specifically to it**, in **both** bands, with a more
negative bias.

## Decision

The rule was: ship only if full@d22 beats lite@d20 by **≥1.0 MAE** without
worsening any band. Full@d20 is already **0.5 behind** and worse in every band.
For depth 20→22 to convert a −0.5 deficit into a +1.0 lead, depth would have to
improve MAE by ≥1.5 — implausible, and deeper search with a stronger net tends
to make evals *harsher*, i.e. further from chess.com, not closer. **Verdict:
don't ship.**

## Why (the real finding)

The full net is genuinely *stronger* — it finds more refutations, judges more
moves as losing win%, and pushes computed accuracy **down and away** from
chess.com's labels. Chess.com's accuracy model is tuned around a bounded engine;
**a stronger engine is harsher than chess.com, not closer to it.** Our lite-net
calibration already matches chess.com about as well as anything can — the
residual ~5 MAE is model-mismatch noise, not an engine-strength deficit.

This takes the **entire** strength-oriented remainder of the correctness roadmap
off the table for accuracy: full net (ruled out here), deeper search (same
mechanism — likely harmful), and Syzygy tablebases (even stronger endgame play).
None of them move accuracy toward chess.com.

## What still has value

- **Phase 1 threads** remain a real, retained ~4.6× speedup and give better live
  best-move lines — both independent of the net choice.
- **Classification thresholds** (blunder/mistake/best) were never calibrated to
  chess.com (only accuracy% was). That is a *separate* correctness axis a
  stronger engine might or might not help — untested here.

## Limitations

Measured only on low-rated current-model games (≤~1350) — exactly where the
roadmap flagged the residual error, but we have **no current-model labels for
high-rated games**, so this says nothing about high bands. The lite@d20 baseline
reused the existing eval cache; full@d20 was freshly evaluated. Full@d20 on the
20-game `fixtures` set and all depth-22 runs were not completed.

## Reproduce

```
node scripts/calibrate-gm.ts --net lite --depth 20 --fixtures scripts/fixtures/lowrated-current
node scripts/calibrate-gm.ts --net full --depth 20 --fixtures scripts/fixtures/lowrated-current
```
