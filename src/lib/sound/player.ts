import type { SoundName } from "./move-sound";

// Only move/capture use Lichess samples (its `standard` wood-clicks, close to
// chess.com). Lichess has no chess.com-like check/checkmate sound, so those two
// are synthesized below: a short bright alert for check, a warm two-note chime
// for game-end.
const SAMPLE_FILES: Partial<Record<SoundName, string>> = {
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
  const url = SAMPLE_FILES[name];
  if (!url || buffers.has(name)) return Promise.resolve();
  let p = loading.get(name);
  if (!p) {
    p = fetch(url)
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

/** A single short percussive blip — fallback for move/capture before the sample
 * loads. Lower pitch reads as a heavier (capture) move. */
function click(ac: AudioContext, freq: number): void {
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "triangle";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.3, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
  osc.connect(gain).connect(ac.destination);
  osc.start(now);
  osc.stop(now + 0.11);
}

/** Play one quick enveloped tone at time `t`. */
function tone(
  ac: AudioContext,
  t: number,
  freq: number,
  dur: number,
  peak: number,
  type: OscillatorType = "triangle",
): void {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

/** Check: a short, bright two-blip alert (quick rising minor third). */
function synthCheck(ac: AudioContext): void {
  const t = ac.currentTime;
  tone(ac, t, 988, 0.1, 0.26); // B5
  tone(ac, t + 0.08, 1175, 0.12, 0.26); // D6
}

/** Game-end: a warm rising two-note chime (perfect fifth) with an octave
 * shimmer on top — celebratory, chess.com-like. */
function synthGameEnd(ac: AudioContext): void {
  const t = ac.currentTime;
  tone(ac, t, 523.25, 0.22, 0.3, "sine"); // C5
  tone(ac, t, 1046.5, 0.22, 0.08, "triangle"); // +octave shimmer
  tone(ac, t + 0.13, 783.99, 0.4, 0.32, "sine"); // G5
  tone(ac, t + 0.13, 1568, 0.4, 0.09, "triangle"); // +octave shimmer
}

/** Play a sound now. No-op server-side / when Web Audio is unavailable. Resumes
 * the context (every caller is inside a user gesture, so autoplay is allowed). */
export function playSound(name: SoundName): void {
  const ac = audioContext();
  if (!ac) return;
  if (ac.state === "suspended") void ac.resume();
  if (name === "check") return synthCheck(ac);
  if (name === "game-end") return synthGameEnd(ac);
  // move / capture → Lichess sample, falling back to a click while it loads.
  const buf = buffers.get(name);
  if (buf) {
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.connect(ac.destination);
    src.start();
  } else {
    click(ac, name === "capture" ? 200 : 320);
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
