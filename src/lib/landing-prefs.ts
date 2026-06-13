/** Remembered landing-page input, per fetch source. */
export type FetchSource = "chesscom" | "lichess";

const key = (source: FetchSource) => `gmbit.username.${source}`;

/** The last username used for `source`, or "" when none / unavailable. */
export function loadUsername(storage: Storage, source: FetchSource): string {
  try {
    return storage.getItem(key(source)) ?? "";
  } catch {
    return "";
  }
}

/** Remember `name` as the last username for `source`. */
export function saveUsername(storage: Storage, source: FetchSource, name: string): void {
  try {
    storage.setItem(key(source), name);
  } catch {
    /* storage unavailable — ignore */
  }
}
