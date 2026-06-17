import type { SoundName } from "./move-sound";

// Both sounds are Lichess `standard` wood-clicks (close to chess.com): a move
// click and a capture click. Checks and checkmates reuse these via the
// resolver, so every move sounds like wood.
const SAMPLE_FILES: Record<SoundName, string> = {
  move: "/sounds/move.mp3",
  capture: "/sounds/capture.mp3",
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
    p = fetch(SAMPLE_FILES[name])
      .then((r) => {
        if (!r.ok) throw new Error(`sound ${name}: ${r.status}`);
        return r.arrayBuffer();
      })
      .then((arr) => ac.decodeAudioData(arr))
      .then((buf) => {
        buffers.set(name, buf);
      })
      .catch(() => {
        /* leave unloaded — playSound() falls back to a short click */
      });
    loading.set(name, p);
  }
  return p;
}

/** A single short percussive blip — fallback for before the sample loads or if
 * it fails. Lower pitch reads as a heavier (capture) move. */
function click(ac: AudioContext, name: SoundName): void {
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "triangle";
  osc.frequency.value = name === "capture" ? 200 : 320;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.3, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
  osc.connect(gain).connect(ac.destination);
  osc.start(now);
  osc.stop(now + 0.11);
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
    click(ac, name); // immediate feedback; real sample loads for next time
    void ensureLoaded(name, ac);
  }
}

/** Warm the sample cache once (decodeAudioData works on a suspended context),
 * so the first real navigation plays the sample rather than the click. */
export function preloadSounds(): void {
  const ac = audioContext();
  if (!ac) return;
  (Object.keys(SAMPLE_FILES) as SoundName[]).forEach((n) => void ensureLoaded(n, ac));
}
