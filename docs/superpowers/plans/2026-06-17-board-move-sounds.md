# Board Move Sounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Play short Lichess audio cues (move / capture / check / game-end) on the analysis board as the user navigates a game, with an always-visible mute toggle that persists across visits.

**Architecture:** A pure resolver maps a move (or SAN) to one of four sound names. A tiny Web Audio singleton pre-decodes four mp3s and plays them fire-and-forget, with a synth fallback if the files are missing. `analysis-screen.tsx` fires a sound on every position change (skipping mount + the background analysis pass) and owns the persisted `muted` state, which it also passes to a speaker button in the TopBar.

**Tech Stack:** TypeScript, React 19, Web Audio API, Vitest. Sounds from Lichess's open-source `standard` set.

**Spec:** `docs/superpowers/specs/2026-06-17-board-move-sounds-design.md`

---

## File Structure

- Create `src/lib/sound/move-sound.ts` — pure `moveSound(move)` + `soundFromSan(san)` resolvers + `SoundName` type.
- Create `src/lib/sound/move-sound.test.ts` — resolver unit tests.
- Create `src/lib/sound/sound-prefs.ts` — `loadMuted`/`saveMuted` (localStorage), mirroring `mode-preference.ts`.
- Create `src/lib/sound/sound-prefs.test.ts` — prefs unit tests.
- Create `src/lib/sound/player.ts` — Web Audio singleton: `playSound(name)`, `preloadSounds()`, synth fallback.
- Create `public/sounds/{move,capture,check,game-end}.mp3` — Lichess clips.
- Create `public/sounds/CREDITS.md` — provenance + license.
- Modify `src/components/analysis/analysis-screen.tsx` — trigger effect + `muted` state + pass to TopBar.
- Modify `src/components/analysis/top-bar.tsx` — speaker toggle button + props.

---

## Task 1: Sound resolver (pure)

**Files:**
- Create: `src/lib/sound/move-sound.ts`
- Test: `src/lib/sound/move-sound.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/sound/move-sound.test.ts
import { describe, expect, it } from "vitest";
import type { Move } from "@/types/analysis";
import { moveSound, soundFromSan } from "./move-sound";

function mv(p: Partial<Move>): Move {
  return { n: 1, c: "w", san: "x", from: "a1", to: "a2", cls: "good", ...p };
}

describe("moveSound", () => {
  it("returns null for no move", () => {
    expect(moveSound(null)).toBeNull();
  });
  it("plays game-end on checkmate, even when it is also a capture", () => {
    expect(moveSound(mv({ mateMove: true, cap: true, check: true }))).toBe("game-end");
  });
  it("plays check on a checking move, even when it is a capture", () => {
    expect(moveSound(mv({ check: true, cap: true }))).toBe("check");
  });
  it("plays capture on a plain capture", () => {
    expect(moveSound(mv({ cap: true }))).toBe("capture");
  });
  it("plays move on a quiet move (incl. castle / promotion)", () => {
    expect(moveSound(mv({}))).toBe("move");
    expect(moveSound(mv({ castle: { rookFrom: "h1", rookTo: "f1" } }))).toBe("move");
    expect(moveSound(mv({ promo: "q" }))).toBe("move");
  });
});

describe("soundFromSan", () => {
  it("maps checkmate '#'", () => {
    expect(soundFromSan("Qxf7#")).toBe("game-end");
  });
  it("maps check '+'", () => {
    expect(soundFromSan("Bb5+")).toBe("check");
  });
  it("maps capture 'x'", () => {
    expect(soundFromSan("exd5")).toBe("capture");
  });
  it("maps a quiet move", () => {
    expect(soundFromSan("Nf3")).toBe("move");
    expect(soundFromSan("O-O")).toBe("move");
  });
  it("prioritises mate over capture for a capture-promotion-mate", () => {
    expect(soundFromSan("exf8=Q#")).toBe("game-end");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/sound/move-sound.test.ts`
Expected: FAIL — cannot find module `./move-sound`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/sound/move-sound.ts
import type { Move } from "@/types/analysis";

export type SoundName = "move" | "capture" | "check" | "game-end";

/** Sound for a fully-annotated move. Priority: mate > check > capture > move
 * (a capture-with-check plays the check sound, matching chess.com). Castle and
 * non-capture promotions fall through to "move"; capture-promotions are caught
 * by `cap`. Returns null when there is no move (e.g. the start position). */
export function moveSound(move: Move | null): SoundName | null {
  if (!move) return null;
  if (move.mateMove) return "game-end";
  if (move.check) return "check";
  if (move.cap) return "capture";
  return "move";
}

/** Same categories resolved from a SAN string, for variation moves which carry
 * only their SAN. Same priority order: '#' > '+' > 'x' > quiet. */
export function soundFromSan(san: string): SoundName {
  if (san.includes("#")) return "game-end";
  if (san.includes("+")) return "check";
  if (san.includes("x")) return "capture";
  return "move";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/sound/move-sound.test.ts`
Expected: PASS (11 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sound/move-sound.ts src/lib/sound/move-sound.test.ts
git commit -m "feat(sound): move-to-sound resolver"
```

---

## Task 2: Mute preference storage

**Files:**
- Create: `src/lib/sound/sound-prefs.ts`
- Test: `src/lib/sound/sound-prefs.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/sound/sound-prefs.test.ts
import { describe, expect, it } from "vitest";
import { loadMuted, saveMuted } from "./sound-prefs";

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

describe("sound prefs", () => {
  it("defaults to not muted when nothing is stored", () => {
    expect(loadMuted(memoryStorage())).toBe(false);
  });
  it("round-trips the muted flag", () => {
    const s = memoryStorage();
    saveMuted(s, true);
    expect(loadMuted(s)).toBe(true);
    saveMuted(s, false);
    expect(loadMuted(s)).toBe(false);
  });
  it("treats a malformed stored value as not muted", () => {
    const s = memoryStorage();
    s.setItem("gmbit.sound-muted", "nonsense");
    expect(loadMuted(s)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/sound/sound-prefs.test.ts`
Expected: FAIL — cannot find module `./sound-prefs`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/sound/sound-prefs.ts
/** Whether the user has muted board move sounds, persisted across visits.
 * Mirrors the mode-preference storage pattern. Default: not muted. */
const KEY = "gmbit.sound-muted";

export function loadMuted(storage: Storage): boolean {
  try {
    return storage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function saveMuted(storage: Storage, muted: boolean): void {
  try {
    storage.setItem(KEY, muted ? "1" : "0");
  } catch {
    /* storage unavailable — falls back to the default next time */
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/sound/sound-prefs.test.ts`
Expected: PASS (3 cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sound/sound-prefs.ts src/lib/sound/sound-prefs.test.ts
git commit -m "feat(sound): persisted mute preference"
```

---

## Task 3: Web Audio player

**Files:**
- Create: `src/lib/sound/player.ts`

Not unit-tested (jsdom has no Web Audio); kept thin and guarded. Verified manually in Task 7.

- [ ] **Step 1: Write the player**

```ts
// src/lib/sound/player.ts
import type { SoundName } from "./move-sound";

const FILES: Record<SoundName, string> = {
  move: "/sounds/move.mp3",
  capture: "/sounds/capture.mp3",
  check: "/sounds/check.mp3",
  "game-end": "/sounds/game-end.mp3",
};

let ctx: AudioContext | null = null;
const buffers = new Map<SoundName, AudioBuffer>();
const loading = new Map<SoundName, Promise<void>>();

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

function ensureLoaded(name: SoundName, ac: AudioContext): Promise<void> {
  if (buffers.has(name)) return Promise.resolve();
  let p = loading.get(name);
  if (!p) {
    p = fetch(FILES[name])
      .then((r) => {
        if (!r.ok) throw new Error(`sound ${name}: ${r.status}`);
        return r.arrayBuffer();
      })
      .then((arr) => ac.decodeAudioData(arr))
      .then((buf) => {
        buffers.set(name, buf);
      })
      .catch(() => {
        /* leave unloaded — playSound() falls back to a synth click */
      });
    loading.set(name, p);
  }
  return p;
}

/** A short synthesized click, so the feature is audible even if the mp3s are
 * missing or still loading. Distinct pitch per category. */
function synth(name: SoundName, ac: AudioContext): void {
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "triangle";
  osc.frequency.value =
    name === "capture" ? 180 : name === "check" ? 660 : name === "game-end" ? 520 : 320;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.3, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
  osc.connect(gain).connect(ac.destination);
  osc.start(now);
  osc.stop(now + 0.13);
}

/** Play a sound now. No-op server-side / when Web Audio is unavailable. Resumes
 * the context (every caller is inside a user gesture, so autoplay is allowed). */
export function playSound(name: SoundName): void {
  const ac = audioContext();
  if (!ac) return;
  if (ac.state === "suspended") void ac.resume();
  const buf = buffers.get(name);
  if (buf) {
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.connect(ac.destination);
    src.start();
  } else {
    synth(name, ac); // immediate feedback; real sample loads for next time
    void ensureLoaded(name, ac);
  }
}

/** Warm the buffer cache once (decodeAudioData works on a suspended context),
 * so the first real navigation plays the sample rather than the synth. */
export function preloadSounds(): void {
  const ac = audioContext();
  if (!ac) return;
  (Object.keys(FILES) as SoundName[]).forEach((n) => void ensureLoaded(n, ac));
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exits clean (no output).

- [ ] **Step 3: Lint**

Run: `npx eslint src/lib/sound/player.ts`
Expected: exits clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/sound/player.ts
git commit -m "feat(sound): Web Audio player with synth fallback"
```

---

## Task 4: Sound assets

**Files:**
- Create: `public/sounds/move.mp3`, `capture.mp3`, `check.mp3`, `game-end.mp3`
- Create: `public/sounds/CREDITS.md`

- [ ] **Step 1: Download the Lichess `standard` clips**

```bash
mkdir -p public/sounds
base="https://raw.githubusercontent.com/lichess-org/lila/master/public/sound/standard"
curl -fL -o public/sounds/move.mp3     "$base/Move.mp3"
curl -fL -o public/sounds/capture.mp3  "$base/Capture.mp3"
curl -fL -o public/sounds/check.mp3    "$base/Check.mp3"
curl -fL -o public/sounds/game-end.mp3 "$base/Victory.mp3"
```

- [ ] **Step 2: Verify the files exist and are non-empty**

Run: `ls -l public/sounds/*.mp3 && file public/sounds/*.mp3`
Expected: four files, each > 1 KB, reported as audio (MPEG ADTS / Audio).

**If any download failed or files are empty (HTML error page):** delete the bad files (`rm -f public/sounds/*.mp3`). The player's synth fallback covers this — the feature still works. Note it in the Task 7 report and move on; the user can drop real clips in later under the same names.

- [ ] **Step 3: Write CREDITS.md**

```markdown
# Sound credits

Board move sounds are from the Lichess open-source `standard` sound set
(github.com/lichess-org/lila, `public/sound/standard/`):

| File          | Lichess source |
|---------------|----------------|
| move.mp3      | Move.mp3       |
| capture.mp3   | Capture.mp3    |
| check.mp3     | Check.mp3      |
| game-end.mp3  | Victory.mp3    |

Lichess is free/libre software (lila is AGPL-3.0). See the lila repository for
the sound assets' licensing.
```

- [ ] **Step 4: Commit**

```bash
git add public/sounds
git commit -m "feat(sound): add Lichess board sound assets + credits"
```

---

## Task 5: TopBar speaker toggle

**Files:**
- Modify: `src/components/analysis/top-bar.tsx`

Done before the analysis-screen wiring so the new props exist when Task 6 passes them.

- [ ] **Step 1: Extend Props**

Replace the `interface Props { ... }` block with:

```ts
interface Props {
  /** The chess.com fetch the open game came from; absent for pasted/demo games. */
  recentGames?: PendingFetch;
  /** PGN of the currently open game, to highlight it in the list. */
  activePgn?: string;
  onSelectGame?: (g: RecentGame) => void;
  /** Whether move sounds are muted. */
  muted?: boolean;
  /** Toggle move-sound mute. When omitted, the speaker control is hidden. */
  onToggleMute?: () => void;
}
```

- [ ] **Step 2: Destructure the new props**

Change the function signature:

```ts
export function TopBar({ recentGames, activePgn, onSelectGame, muted, onToggleMute }: Props) {
```

- [ ] **Step 3: Add the speaker button at the bottom of the rail**

Inside the inner `<div className="group absolute ...">`, immediately before its closing `</div>` (i.e. after the `{games.length > 0 && ( ... )}` block), add:

```tsx
        {onToggleMute && (
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? "Unmute move sounds" : "Mute move sounds"}
            aria-pressed={muted}
            title={muted ? "Sound off" : "Sound on"}
            className="mt-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-3 transition-colors hover:bg-bg-2 hover:text-text"
          >
            {muted ? (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-[18px] w-[18px]"
                aria-hidden
              >
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-[18px] w-[18px]"
                aria-hidden
              >
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
            )}
          </button>
        )}
```

- [ ] **Step 4: Typecheck + lint + tests**

Run: `npx tsc --noEmit && npx eslint src/components/analysis/top-bar.tsx && npx vitest run`
Expected: all clean; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/analysis/top-bar.tsx
git commit -m "feat(sound): always-visible speaker toggle in the TopBar"
```

---

## Task 6: Trigger sounds + mute state in the analysis screen

**Files:**
- Modify: `src/components/analysis/analysis-screen.tsx`

- [ ] **Step 1: Add imports**

After the existing `@/lib/...` imports near the top of the file (e.g. below the `clock` import), add:

```ts
import { moveSound, soundFromSan, type SoundName } from "@/lib/sound/move-sound";
import { playSound, preloadSounds } from "@/lib/sound/player";
import { loadMuted, saveMuted } from "@/lib/sound/sound-prefs";
```

- [ ] **Step 2: Add muted state + a preload-on-mount effect**

Inside `AnalysisScreen`, just after the existing `const [flip, setFlip] = useState(false);` line, add:

```ts
  const [muted, setMuted] = useState(false);
  const toggleMuted = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      saveMuted(window.localStorage, next);
      return next;
    });
  }, []);
  useEffect(() => {
    const stored = loadMuted(window.localStorage);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot read from localStorage on mount
    if (stored) setMuted(true);
    preloadSounds();
  }, []);
```

- [ ] **Step 3: Add the sound trigger effect**

Add this effect immediately after the block from Step 2 (it only reads `ply`,
`variation`, `muted`, `analyzedGame`, all defined above the render return):

```ts
  // Play a sound on every position change, both directions, plus variation
  // moves. Keyed on a position signature (not object identity) so the
  // background analysis pass — which swaps `analyzedGame` but not the position —
  // never fires it. The first run (mount) is skipped so the demo/imported game
  // is silent on load.
  const soundSigRef = useRef<string | null>(null);
  useEffect(() => {
    const sig = variation ? `v${variation.history.length}` : `m${ply}`;
    const prev = soundSigRef.current;
    soundSigRef.current = sig;
    if (prev === null || sig === prev || muted) return;
    let name: SoundName | null;
    if (variation) {
      const last = variation.history.at(-1);
      name = last ? soundFromSan(last.san) : null;
    } else {
      name = ply > 0 ? moveSound(analyzedGame.moves[ply - 1]) : null;
    }
    if (name) playSound(name);
  }, [ply, variation, muted, analyzedGame]);
```

- [ ] **Step 4: Pass mute props to TopBar**

Find the `<TopBar ... />` line in the render and add the two props (the props
already exist on TopBar from Task 5):

```tsx
      <TopBar
        recentGames={recentGames}
        activePgn={activePgn}
        onSelectGame={onSelectGame}
        muted={muted}
        onToggleMute={toggleMuted}
      />
```

- [ ] **Step 5: Typecheck + lint + existing tests**

Run: `npx tsc --noEmit && npx eslint src/components/analysis/analysis-screen.tsx && npx vitest run`
Expected: tsc clean; eslint clean; all existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/analysis/analysis-screen.tsx
git commit -m "feat(sound): play board sounds on navigation; own mute state"
```

---

## Task 7: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Build**

Run: `npx next build`
Expected: `build exit: 0`, `/analyze` route present.

- [ ] **Step 2: Manual listen test**

Run: `npx next start -p 4321` (then open `http://localhost:4321/analyze`).

Verify:
- No sound on initial load.
- Right arrow → move/capture/check sounds as appropriate; a checkmate move plays the game-end jingle.
- Left arrow also plays (both-directions).
- Making a move on the board (variation) plays a sound.
- Speaker icon at the bottom of the left rail toggles sound; choice survives a reload.

If the mp3s failed to download in Task 4, confirm the synth fallback clicks are audible instead, and note it.

- [ ] **Step 3: Stop the server**

Run: `pkill -f "next start -p 4321"`

- [ ] **Step 4: Final commit (if any stray changes)**

```bash
git add -A && git commit -m "chore(sound): verification pass" || echo "nothing to commit"
```

---

## Self-Review notes

- **Spec coverage:** source set (Task 4), resolver priority incl. SAN (Task 1), prefs (Task 2), player + synth fallback (Task 3), always-visible TopBar toggle (Task 5), trigger both-directions + mount-skip + analysis-pass-safe (Task 6), manual verification (Task 7). All spec sections mapped.
- **Type consistency:** `SoundName` defined in Task 1 and imported everywhere; `playSound`/`preloadSounds` (Task 3) used in Task 6; `loadMuted`/`saveMuted` (Task 2) used in Task 6; `muted`/`onToggleMute` props defined on TopBar in Task 5 and passed from the analysis screen in Task 6 (TopBar-before-caller ordering avoids a mid-plan type error).
- **No placeholders:** every code step is complete.
