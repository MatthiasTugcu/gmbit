import type { AnalysisMode } from "@/types/analysis";

/**
 * The analysis model the user last picked on the landing page, persisted so the
 * choice is stable across visits — and so re-opening a recent game uses the
 * model they currently have selected rather than resetting each load.
 */
const KEY = "gmbit.mode-preference";
const DEFAULT: AnalysisMode = "fast";

/** The stored model preference, or "fast" when unset/unreadable/malformed. */
export function loadModePreference(storage: Storage): AnalysisMode {
  try {
    const raw = storage.getItem(KEY);
    return raw === "fast" || raw === "deep" ? raw : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

/** Persist the chosen analysis model. */
export function saveModePreference(storage: Storage, mode: AnalysisMode): void {
  try {
    storage.setItem(KEY, mode);
  } catch {
    /* storage unavailable — the picker just falls back to the default next time */
  }
}
