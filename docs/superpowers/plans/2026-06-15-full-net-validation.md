# Full-Net Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure whether Stockfish's 108MB full NNUE net produces accuracy estimates meaningfully closer to chess.com than the shipped lite net, so we can decide — with evidence — whether to build a 108MB delivery mechanism in a later phase.

**Architecture:** Extend the existing offline calibration script `scripts/calibrate-gm.ts` with a `--net lite|full` flag that switches the spawned engine binary and namespaces the eval cache. Then run lite-vs-full at matched and deeper depths over the current-model validation fixtures and compare the script's own MAE/bias reports against chess.com labels. No app code changes — this is a pure measurement experiment.

**Tech Stack:** Node (TS via type-stripping), `stockfish` npm package (`stockfish-18-single.js` full single-threaded build, already present in `node_modules/stockfish/bin`), `chess.js`, the project's `classify.ts` accuracy math.

**Spec:** `docs/superpowers/specs/2026-06-15-full-net-validation-design.md`

---

## Background facts (verified 2026-06-15)

- The full single-threaded build `node_modules/stockfish/bin/stockfish-18-single.js` runs the **identical** UCI-over-stdin/stdout harness as the lite build and resolves its 108MB `.wasm` next to itself. Smoke-tested: `id name Stockfish 18 WASM`, returns `bestmove`. **No vendoring into `public/` and no `.gitignore` change is needed** — the script spawns it directly from `node_modules`.
- `scripts/calibrate-gm.ts` already: spawns a pool of `--workers` engine subprocesses (default 6), evaluates every unique FEN at `--depth` (default 20) / MultiPV 2, appends results to an NDJSON cache keyed `fen|d{DEPTH}|mpv{MULTI_PV}`, then reports MAE/bias vs `targets.json` at the app's current params **and** runs a param-refit sweep with a stratified holdout. Both the current-param and refit MAEs are printed by a single run.
- The existing cache `/tmp/gmbit-eval-cache-gm.ndjson` (18MB) already holds **lite @ d20/mpv2** evals covering `gm-sample`, `fixtures`, and `lowrated-current`, so the lite baseline runs are near-instant.
- Current-model fixture dirs:
  - `scripts/fixtures/lowrated-current/` — 60 games, **has `meta.json`** (rating bands etc.). **Primary** set (per-band reporting works).
  - `scripts/fixtures/` (root) — 20 games, `games.pgn` + `targets.json`, **no `meta.json`** (bands report as "unknown"). **Secondary** confirmation set.
  - Both current-model sets are low-rated (≤~1350); they carry no high-band coverage — an honest limitation to state in the writeup.
- Shipped accuracy params (mirrored as `APP_*` constants in the script, lines ~52-56): `k=0.005, floor=25, hopeless=15, blend=0`.

---

## Task 1: Add `--net lite|full` flag and net-aware cache key to calibrate-gm.ts

**Files:**
- Modify: `scripts/calibrate-gm.ts` (arg parsing ~37-50; `startEngine` spawn line 140; `cacheKey` line 207; eval summary log lines 228-230)

This task is verified by running the script (the repo has no vitest harness for these CLI scripts; the script self-checks correctness at runtime via its existing drift check). The "failing test" is an observable behavior absent before the change.

- [ ] **Step 1: Confirm the behavior is absent (the failing test)**

Before any edit, run the full-net request on one game and check the cache for full-net keys:

```bash
cd /Users/matthiastugcu/Desktop/Projects/gmbit
node scripts/calibrate-gm.ts --net full --fixtures scripts/fixtures/lowrated-current --eval-only --max-games 1 2>&1 | tail -3
grep -c '|full' /tmp/gmbit-eval-cache-gm.ndjson
```

Expected: the `--net full` flag is currently an unrecognized arg, silently ignored — the script runs the **lite** default, and `grep -c '|full'` prints `0`. (The eval is near-instant because those lite keys are already cached.)

- [ ] **Step 2: Add and validate the `--net` flag**

In `scripts/calibrate-gm.ts`, in the arg-parsing block (right after `const fitOnly = argv.includes("--fit-only");`, line ~50), add:

```ts
const NET = arg("--net", "lite");
if (NET !== "lite" && NET !== "full") {
  console.error(`--net must be "lite" or "full" (got "${NET}")`);
  process.exit(1);
}
const ENGINE_BIN =
  NET === "full"
    ? join(ROOT, "node_modules/stockfish/bin/stockfish-18-single.js")
    : join(ROOT, "public/engine/stockfish-18-lite-single.js");
```

- [ ] **Step 3: Spawn the selected binary**

Replace the hardcoded path in `startEngine` (line 140):

```ts
  const child = spawn("node", [join(ROOT, "public/engine/stockfish-18-lite-single.js")], {
```

with:

```ts
  const child = spawn("node", [ENGINE_BIN], {
```

- [ ] **Step 4: Make the cache key net-aware**

Replace `cacheKey` (line 207):

```ts
const cacheKey = (fen: string) => `${fen}|d${DEPTH}|mpv${MULTI_PV}`;
```

with (lite stays suffix-free so the existing 18MB cache stays valid; only full carries `|full`):

```ts
const cacheKey = (fen: string) => `${fen}|d${DEPTH}|mpv${MULTI_PV}${NET === "full" ? "|full" : ""}`;
```

- [ ] **Step 5: Surface the net + binary in the eval summary**

In `evaluateAll`, update the summary log (lines 228-230) so runs are self-documenting:

```ts
  console.error(
    `${games.length} games, ${uniqueFens.length} unique positions, ${missing.length} to evaluate (net ${NET}, depth ${DEPTH}, ${workerCount} workers)`,
  );
```

- [ ] **Step 6: Confirm the behavior is present (the test passes)**

```bash
cd /Users/matthiastugcu/Desktop/Projects/gmbit
node scripts/calibrate-gm.ts --net full --fixtures scripts/fixtures/lowrated-current --eval-only --max-games 1 2>&1 | grep -E 'net full|to evaluate'
grep -c '|full' /tmp/gmbit-eval-cache-gm.ndjson
```

Expected: the summary line reads `... (net full, depth 20, 6 workers)`, and `grep -c '|full'` now prints a **non-zero** count (the unique positions of that one game, written with `|full` keys). The lite key count is unchanged.

- [ ] **Step 7: Confirm validation and lite-default still work**

```bash
node scripts/calibrate-gm.ts --net bogus --fixtures scripts/fixtures/lowrated-current --eval-only --max-games 1 2>&1 | head -1
node scripts/calibrate-gm.ts --fixtures scripts/fixtures/lowrated-current --eval-only --max-games 1 2>&1 | grep 'to evaluate'
```

Expected: first command prints `--net must be "lite" or "full" (got "bogus")` and exits; second defaults to `net lite` and is instant (already cached).

- [ ] **Step 8: Commit**

```bash
cd /Users/matthiastugcu/Desktop/Projects/gmbit
git add scripts/calibrate-gm.ts
git commit -m "feat(calibrate): --net lite|full flag with net-namespaced eval cache

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Run the lite-vs-full validation and record the decision

**Files:**
- Create: `docs/superpowers/specs/2026-06-15-full-net-validation-results.md`
- Modify: `/Users/matthiastugcu/.claude/projects/-Users-matthiastugcu-Desktop-Projects-gmbit/memory/analysis-correctness-roadmap.md` (and its `MEMORY.md` index line) — record the outcome

This task runs multi-hour background engine compute. Per the standing token-efficiency agreement: kick off once, do not poll progress, touch once when finished. The NDJSON cache makes every run resumable, so an interrupted run simply continues.

- [ ] **Step 1: Capture the lite baseline (near-instant, fully cached)**

```bash
cd /Users/matthiastugcu/Desktop/Projects/gmbit
node scripts/calibrate-gm.ts --net lite --depth 20 --fixtures scripts/fixtures/lowrated-current > /tmp/val-lite-d20-lowrated.txt 2>/dev/null
node scripts/calibrate-gm.ts --net lite --depth 20 --fixtures scripts/fixtures           > /tmp/val-lite-d20-fixtures.txt 2>/dev/null
```

Expected: each finishes in seconds (no positions to evaluate). Each file contains a `drift check OK` line, a `=== baseline (k=0.005...) ===` block with `MAE`/`bias` overall and per band, and a `=== fit on all ... ===` refit block. If a file instead says positions are missing from cache, the lite cache for that set was evicted — re-run without redirect to let it evaluate (still lite, still fast).

- [ ] **Step 2: Pilot the full net on 10 games to estimate the rate**

The full single-threaded net is much slower per position and has no movetime cap here (`go depth D` only), so first measure throughput on a subset:

```bash
cd /Users/matthiastugcu/Desktop/Projects/gmbit
node scripts/calibrate-gm.ts --net full --depth 20 --fixtures scripts/fixtures/lowrated-current --max-games 10 --eval-only
```

Expected: stderr prints `... (net full, depth 20, 6 workers)` then periodic `eval N/M (R/s, ~T min left)` lines. Read R/s and the position count to project the full 60-game / depth-22 runtime before committing to it.

- [ ] **Step 3: Kick off the full-net evaluation runs in the background**

Run all four full-net evals (both depths × both fixture sets). Each only evaluates positions not already cached, so the pilot's positions are reused. Run them sequentially in one backgrounded shell so they share the 6-worker pool cleanly:

```bash
cd /Users/matthiastugcu/Desktop/Projects/gmbit
( node scripts/calibrate-gm.ts --net full --depth 20 --fixtures scripts/fixtures/lowrated-current > /tmp/val-full-d20-lowrated.txt 2>/tmp/val-full-d20-lowrated.err
  node scripts/calibrate-gm.ts --net full --depth 22 --fixtures scripts/fixtures/lowrated-current > /tmp/val-full-d22-lowrated.txt 2>/tmp/val-full-d22-lowrated.err
  node scripts/calibrate-gm.ts --net full --depth 20 --fixtures scripts/fixtures                   > /tmp/val-full-d20-fixtures.txt 2>/tmp/val-full-d20-fixtures.err
  node scripts/calibrate-gm.ts --net full --depth 22 --fixtures scripts/fixtures                   > /tmp/val-full-d22-fixtures.txt 2>/tmp/val-full-d22-fixtures.err
  echo DONE > /tmp/val-full.done ) &
```

Use the Bash tool's `run_in_background` for this. Do not poll; resume when notified it exited (the `/tmp/val-full.done` marker appears).

- [ ] **Step 4: Verify all runs completed and produced reports**

```bash
cat /tmp/val-full.done
for f in /tmp/val-full-d20-lowrated.txt /tmp/val-full-d22-lowrated.txt /tmp/val-full-d20-fixtures.txt /tmp/val-full-d22-fixtures.txt; do
  echo "== $f =="; grep -E 'drift check OK|baseline \(|final params' "$f" | head -3
done
```

Expected: `DONE`, and every file shows `drift check OK` plus a baseline and a `final params` line. If any `.err` file shows engine crashes or a file is truncated, re-run that one command (it resumes from cache).

- [ ] **Step 5: Extract the comparison numbers**

Pull the overall MAE/bias at **current params** (the `baseline, all games` line) and at **refit params** (the `final params, all games` line) from each report:

```bash
for f in /tmp/val-lite-d20-lowrated.txt /tmp/val-full-d20-lowrated.txt /tmp/val-full-d22-lowrated.txt; do
  echo "== $f =="
  grep -E 'baseline, all games|final params, all games' "$f"
done
echo "--- per-band, current params (lite vs full d22, lowrated) ---"
grep -A6 'baseline, all games' /tmp/val-lite-d20-lowrated.txt | grep 'band'
grep -A6 'baseline, all games' /tmp/val-full-d22-lowrated.txt | grep 'band'
```

The key comparisons (all on the 60-game banded `lowrated-current` set):
- **Net effect at matched depth:** lite @ d20 baseline MAE vs full @ d20 baseline MAE.
- **Real In-depth config:** lite @ d20 baseline MAE vs full @ d22 baseline MAE.
- **Best-case full net:** lite @ d20 baseline MAE vs full @ d22 **refit** MAE.
- **Per band:** does full @ d22 worsen any rating band's MAE vs lite @ d20?

- [ ] **Step 6: Apply the decision rule and write up the result**

Decision rule (from the spec): ship the full net in a follow-up phase **only if** full @ d22 beats the lite @ d20 baseline by **≥ 1.0 MAE** on the current-model set without worsening any rating band; otherwise pivot to "deeper lite."

Write `docs/superpowers/specs/2026-06-15-full-net-validation-results.md` containing: a table of the five runs (lite d20; full d20/d22 × lowrated/fixtures) with current-param and refit MAE/bias; the per-band lite-vs-full-d22 comparison; the explicit ship / don't-ship conclusion against the ≥1.0 rule; and the stated low-rated-only coverage limitation. Keep it to aggregates only (no raw game rows).

- [ ] **Step 7: Commit the results writeup**

```bash
cd /Users/matthiastugcu/Desktop/Projects/gmbit
git add docs/superpowers/specs/2026-06-15-full-net-validation-results.md
git commit -m "docs: full-net validation results and ship decision

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 8: Update the roadmap memory with the outcome**

Edit `/Users/matthiastugcu/.claude/projects/-Users-matthiastugcu-Desktop-Projects-gmbit/memory/analysis-correctness-roadmap.md`: change the Phase 2 entry to record the measured result (MAE deltas) and the decision — either "full net justified → build delivery (108MB lazy-load/cache, worker-collision fix) as Phase 2b" or "full net NOT justified → Phase 2 pivots to deeper-lite." Correct the stale "~40MB asset" estimate to 108MB. Update the matching one-line hook in `MEMORY.md`.

---

## Self-Review

- **Spec coverage:** `--net lite|full` flag (Task 1 Step 2-3) ✓; net-aware cache key with lite suffix-free (Task 1 Step 4) ✓; current-model dataset, lowrated primary + fixtures secondary (Task 2 Step 1, 3) ✓; lite d20 / full d20 / full d22 runs (Task 2 Step 1, 3) ✓; current-param **and** refit comparison (Task 2 Step 5, the script prints both) ✓; per-band reporting (Task 2 Step 5) ✓; ≥1.0 MAE decision rule + writeup regardless of outcome (Task 2 Step 6) ✓; background/no-poll compute (Task 2 Step 3) ✓; out-of-scope delivery untouched (no app files modified) ✓.
- **Placeholder scan:** every code step shows the exact replacement text; every run step shows the exact command and expected output. No TBD/TODO.
- **Type/name consistency:** `NET`, `ENGINE_BIN`, `cacheKey` referenced consistently across Task 1 steps; `--net`, `--depth`, `--fixtures`, `--max-games`, `--eval-only` are existing flags plus the one new `--net`. Cache key format `fen|d{DEPTH}|mpv{MULTI_PV}[|full]` matches between Step 4 and the Step 1/6 `grep '|full'` checks.
