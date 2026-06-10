# Chess.com-style Game Analysis — Design

**Date:** 2026-06-11
**Status:** Approved pending user review

## Problem

The current game analysis (`src/lib/engine/use-game-analysis.ts`) diverges from chess.com in three user-visible ways:

1. **Book moves are fake.** Any move in the first 16 plies with < 5 win% loss is tagged "book". There is no opening database, so non-theory moves get tagged and real theory moves that dip the eval don't.
2. **Best moves are wrong.** A move is "best" only if its from/to squares match the engine's top move from a depth-14 search. Promotion piece is ignored, and at depth 14 the engine's pick is noisy, producing both false positives and false negatives.
3. **Accuracy is off.** Per-move accuracy uses the published Lichess formula, but game accuracy is a plain average with an arbitrary 2-point loss floor on non-best moves. Chess.com/Lichess use harmonic + volatility-weighted means.

Goal: make classifications and accuracy match chess.com as closely as practical with in-browser Stockfish.

## Decisions (made with user)

- **Move classes:** full chess.com set — add `excellent`, `great`, `miss` to the existing seven.
- **Opening book:** vendor the Lichess `chess-openings` dataset; book = position lookup, no eval involvement.
- **Engine budget:** two-pass — base pass depth 16 / MultiPV 2 on every position, refinement pass depth 20 on critical moves. Target total ≤ ~2.5 min per typical game.

## Architecture

New pure modules, with the React hook reduced to orchestration:

```
scripts/build-openings.mjs        # build-time: TSV → openings.json (committed output)
vendor/chess-openings/*.tsv       # vendored Lichess dataset (a–e.tsv)
src/data/openings.json            # generated: { [positionKey]: openingName }
src/lib/analysis/openings.ts      # loadOpenings(), lookup(fen) → name | null, position key helper
src/lib/analysis/classify.ts      # winrate, classifyMove, move/game accuracy — pure, unit-tested
src/lib/engine/index.ts           # extended: MultiPV option, multi-line results
src/lib/engine/use-game-analysis.ts  # engine loop: base pass, refinement pass, state updates
```

Position key = first four FEN fields (board, side to move, castling, en passant). Halfmove/fullmove counters are stripped so transpositions still match.

### Opening book (`openings.ts` + build script)

- `scripts/build-openings.mjs` replays each TSV line's PGN with chess.js and emits every position along the way into `src/data/openings.json`, mapping position key → opening name (deepest/longest line wins for the name).
- The JSON is committed (no network at build time) and lazy-loaded via dynamic `import()` so it doesn't bloat the initial bundle. Expected ~10–15k positions, ~150–250KB gzipped.
- **Book rule:** move *i* is Book iff every move before it was Book and the position *after* move *i* is in the map. Engine eval plays no role. Hard cap at ply 40 as a safety bound (the dataset rarely goes deeper).
- **Opening name:** the name attached to the deepest in-book position reached is written to `Players.opening` (field already exists in `src/types/analysis.ts`).

### Engine changes (`engine/index.ts`)

- `AnalyzeOptions` gains `multiPv?: number`. Before `go`, send `setoption name MultiPV value N`.
- `parseInfoLine` parses the `multipv` token. `AnalysisInfo` gains `lines: { cp?, mate?, pv }[]` (index 0 = best). Existing single-line fields stay populated from line 1 for backward compatibility with the live-eval hook (`use-engine-eval.ts`).
- `bestmove` remains authoritative for line 1's first move.

### Analysis loop (`use-game-analysis.ts`)

**Base pass:** for every position, `analyze(fen, { depth: 16, multiPv: 2 })`. Store per-position: best line eval, second line eval, best move UCI, and the position eval (white-positive).

**Refinement pass:** after the base pass, re-analyze at depth 20 / MultiPV 2 the *before* and *after* positions of moves that are:
- classified mistake or blunder,
- candidate Miss (mover had win% ≥ 70 before, per base pass),
- candidate Great (played = engine best and PV1–PV2 gap ≥ 8 win%),
- candidate Brilliant (best + sacrifice detected),
- or had |win% swing| ≥ 15.

Each refined position is analyzed once even if it borders two critical moves. Affected moves are reclassified and accuracies recomputed from the refined evals. Progress UI counts both passes (`done/total` covers base; refinement reuses the same progress object with the extra positions appended to `total`).

## Classification ladder (`classify.ts`)

All thresholds are win% loss for the mover: `loss = winrateBefore − winrateAfter` (mover's perspective, Lichess logistic cp→win% mapping, mate scores → 0/100). Evaluated in priority order:

1. **Book** — per opening-book rule above. Checked before anything else.
2. **Brilliant (!!)** — qualifies as Best (rule 4), the move sacrifices material (see below), mover's win% after ≥ 30 (not lost anyway), and mover wasn't already completely winning (win% before ≤ 95).
3. **Great (!)** — qualifies as Best, and the second-best line is ≥ 12 win% worse than the best line (the only good move).
4. **Best** — played move equals the engine's top line as a *full* UCI string (from+to+promotion), **or** the played move's resulting eval (from the next position's search) is at least as good for the mover as the engine's predicted best-line eval. The eval-comparison branch kills depth-noise misclassification in both directions.
5. **Excellent** — loss < 2.
6. **Good** — loss < 5.
7. **Miss** — mover had a decisive chance (mate available in the best line, or best-line win% ≥ 75) and the played move's loss lands in the inaccuracy-or-worse range (≥ 10), dropping win% below 60. Miss replaces what would otherwise be Inaccuracy/Mistake/Blunder.
8. **Inaccuracy (?!)** — loss < 10.
9. **Mistake (?)** — loss < 20.
10. **Blunder (??)** — loss ≥ 20. Additionally, allowing a forced mate against you when none existed before is always at least Mistake, and hanging mate-in-1 is Blunder regardless of cp loss.

**Sacrifice detection (for Brilliant):** using chess.js on the position after the move — the moved piece (≥ minor piece value) can be captured by the opponent without adequate compensation in simple static exchange terms (capture-square defenders vs attackers by piece value), or the move deliberately gives up material (captures a lower-value piece while a recapture wins material). Simple SEE-style check, not a search; unit tests pin the known cases (e.g. classic queen sacs) rather than chasing perfection.

## Accuracy (`classify.ts`)

- Per-move: `accuracy = 103.1668 · e^(−0.04354 · loss) − 3.1669`, clamped to [0, 100], `loss = max(0, loss)`. **No floor for non-best moves** (the existing 2-point floor is removed).
- Book moves are excluded from accuracy entirely.
- Game accuracy per color (Lichess method): compute window-based volatility weights — rolling standard deviation of win% over a window of ~max(2, ⌈nMoves/10⌉) positions, clamped to [0.5, 12] — then take the mean of (a) the volatility-weighted mean and (b) the harmonic mean of that color's move accuracies. Round to one decimal for display.

## UI changes

- `src/lib/classification.tsx`: add `excellent`, `great`, `miss` entries (label, symbol, icon, color). Chess.com conventions: Great = "!" (blue), Excellent = check (green), Miss = "✗"-style mark (red-orange).
- `src/types/analysis.ts`: extend `MoveClass` union.
- Move list, class summary bar (`class-bar.tsx`), and badges automatically pick up new classes from `CLS`; verify counts and ordering (Brilliant, Great, Best, Excellent, Good, Book, Inaccuracy, Mistake, Miss, Blunder).
- `GRAPH_MARK` gains `great` and `miss`.
- Opening name from the book lookup is displayed via the existing `Players.opening` field.
- `src/data/demo-game.ts`: re-annotate or minimally patch so the demo game uses valid classes.

## Error handling

- Openings JSON fails to load → analysis proceeds with no book moves (log once, no crash).
- Engine errors/aborts mid-pass → keep current behavior (silent stop, partial annotation stays).
- Refinement pass is best-effort: cancellation between passes leaves base-pass classifications in place.

## Testing

Add vitest (no test setup exists today) scoped to the pure modules:

- `classify.test.ts`: threshold boundaries for every class, mate handling, Miss/Great/Brilliant rules, best-by-eval fallback, accuracy formulas (golden values from the Lichess formula), harmonic/volatility game accuracy.
- `openings.test.ts`: position-key normalization, book-ends-stays-ended rule, transposition match, deepest-name selection.
- Build script smoke test: generated JSON contains known mainline positions (e.g. Najdorf) with correct names.

Engine/UI integration is verified manually with a real game import.

## Out of scope

- Server-side analysis, multithreaded Stockfish build (COOP/COEP), "forced" move class, per-move coach commentary, brilliant-move perfection (heuristic is intentionally simple).