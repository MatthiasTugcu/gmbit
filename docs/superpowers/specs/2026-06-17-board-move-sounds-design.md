# Board move sounds — design

**Date:** 2026-06-17
**Status:** Approved

## Goal

Play short audio cues on the analysis board as the user moves through a game —
move, capture, check, and game-end — for a feel close to chess.com. Sounds come
from Lichess's open-source `standard` set (free to redistribute).

## Decisions (from brainstorming)

- **Source:** Lichess `standard` sound set. Pure Lichess — no mixed sources.
- **When:** Every position change, **both directions** (forward, backward, and
  jumps), plus moves the user makes in a variation. One sound per navigation
  event, for the move the user lands on. The initial board mount and the
  background analysis pass stay silent.
- **Toggle:** A speaker on/off control, **always visible**, pinned at the bottom
  of the TopBar rail. The choice persists across visits.

## Sound set

Lichess has no dedicated castle or promotion sound (it reuses the move sound),
so the set collapses to four clips:

| Category   | File                      | Lichess source |
|------------|---------------------------|----------------|
| `move`     | `public/sounds/move.mp3`     | `Move.mp3`     |
| `capture`  | `public/sounds/capture.mp3`  | `Capture.mp3`  |
| `check`    | `public/sounds/check.mp3`    | `Check.mp3`    |
| `game-end` | `public/sounds/game-end.mp3` | `Victory.mp3`  |

`public/sounds/CREDITS.md` records the Lichess origin and license.

Castle and non-capture promotions play `move`; capture-promotions play
`capture` (handled by the move's `cap` flag).

## Move → sound resolution

`lib/sound/move-sound.ts` exposes two **pure** functions:

```ts
export type SoundName = "move" | "capture" | "check" | "game-end";
export function moveSound(move: Move | null): SoundName | null;
export function soundFromSan(san: string): SoundName;
```

`moveSound` priority (a move can be several things at once; first match wins),
mirroring chess.com's behaviour where a capture-with-check plays the check
sound:

1. `move.mateMove` → `game-end`
2. `move.check` → `check`
3. `move.cap` → `capture`
4. otherwise → `move`

`moveSound(null)` returns `null` (no move to represent, e.g. the start
position) — the caller plays nothing.

`soundFromSan` resolves the same categories from a SAN string, for variation
moves (which carry only `{ from, to, san }`, not the analysed flags): `#` →
`game-end`, `+` → `check`, `x` → `capture`, otherwise `move`. Same priority
order. Both functions are unit-tested.

## Components

Each unit is small, single-purpose, and independently testable.

### `lib/sound/move-sound.ts` (pure)
The resolver above. Unit-tested for every priority branch and `null`.

### `lib/sound/sound-prefs.ts` (pure-ish, storage)
`loadMuted(storage): boolean` / `saveMuted(storage, muted): void`, mirroring the
existing `ply-storage` / `landing-prefs` pattern (single key, try/catch around
storage access, sensible default = **not muted**). Unit-tested round-trip.

### `lib/sound/player.ts` (side-effectful singleton)
A tiny Web Audio engine:

- Lazily creates a single `AudioContext` on first `play()` and `resume()`s it
  (every trigger is a user gesture, so autoplay policy is satisfied).
- Fetches + `decodeAudioData` the four files once, caches the `AudioBuffer`s.
- `play(name: SoundName)`: fire-and-forget `BufferSource` → destination.
  Overlapping playback is fine for rapid scrubbing.
- No-ops safely when: server-side (no `window`/`AudioContext`), audio
  unsupported, or a buffer hasn't loaded yet. Muting is enforced by the caller
  (it simply doesn't call `play`), keeping the player stateless beyond its
  buffer cache.

Not unit-tested (Web Audio isn't available in jsdom); kept thin and guarded.

### Trigger — in `analysis-screen.tsx`
An effect keyed on a **position signature**, not object identity, so the
background analysis pass (which replaces `analyzedGame`) never fires it:

- Signature = `variation ? variation.history.length : ply` plus a flag for
  whether we're in a variation.
- A `useRef` skips the **first** run (the demo opens mid-game at `demoPly`; an
  imported game opens at ply 0 — neither should sound on load).
- On each subsequent change, resolve the landed move and play:
  - In a variation: `soundFromSan(variation.history.at(-1).san)`.
  - Mainline at `ply > 0`: `moveSound(analyzedGame.moves[ply - 1])`.
  - `ply === 0`, no variation: silent (`moveSound(null)`).
- Skips entirely when muted.

### Toggle — TopBar
Add a speaker icon button pinned at the bottom of the TopBar rail (`mt-auto`),
always visible in both the collapsed (72px) and hovered (280px) states. It
reflects and flips the muted state.

State ownership: `analysis-screen.tsx` holds `muted` (initialised from
`loadMuted`, persisted via `saveMuted` on toggle) and passes `muted` +
`onToggleMute` to `TopBar`. The trigger effect reads the same `muted`.

## Data flow

```
user navigates / plays move
        │
        ▼
analysis-screen effect (position signature changed, not muted, not first run)
        │  resolves Move → SoundName via moveSound()
        ▼
player.play(name)  ──►  AudioContext ──► speakers
```

```
TopBar speaker click ──► onToggleMute ──► analysis-screen setMuted + saveMuted
```

## Edge cases

- **Autoplay policy:** context created/resumed inside the user-gesture-driven
  effect; first sound may be a hair late while it resumes — acceptable.
- **Rapid scrubbing:** fire-and-forget sources overlap; no queueing needed.
- **SSR / jsdom:** player guards on `typeof window` and `AudioContext` presence.
- **Analysis completion:** changes move metadata, not ply/variation length, so
  the signature is unchanged → no spurious sound.
- **Muted on load:** respected before any sound plays.

## Fallback risk

If fetching the Lichess mp3s into `public/sounds/` fails in the build sandbox,
ship a Web-Audio **synth fallback** in `player.ts` (simple generated clicks /
tones per category) so the feature works end-to-end. Real clips can be dropped
in later under the same filenames with zero code change.

## Testing

- `move-sound.test.ts` — `moveSound` every priority branch (mate, check,
  capture, plain, capture+check → check, mate+capture → game-end) and `null`;
  `soundFromSan` for `#`, `+`, `x`, plain, and combos (`exf8=Q#` → game-end).
- `sound-prefs.test.ts` — default, save/load round-trip, corrupt/empty storage.
- `player.ts` — not unit-tested (jsdom lacks Web Audio); verified manually.

## Out of scope (YAGNI)

- Volume slider (single sensible level; mute is the only control).
- Per-event enable/disable.
- Sound themes / multiple sets.
- Distinct castle / promotion sounds (Lichess has none; deferred).
