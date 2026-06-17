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
