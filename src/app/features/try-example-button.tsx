"use client";

import { clearPendingPgn, savePendingMeta, savePendingMode } from "@/lib/pending-game";

/**
 * Opens the bundled demo game: clearing the pending PGN makes /analyze fall
 * back to its built-in demo, which is pre-annotated (no engine run needed).
 */
export function TryExampleButton() {
  const open = () => {
    clearPendingPgn(window.sessionStorage);
    savePendingMode(window.sessionStorage, "deep");
    savePendingMeta(window.sessionStorage, { source: "demo" });
    // Full navigation (not router.push) so /analyze loads with its COOP/COEP
    // headers and becomes cross-origin-isolated — required for the threaded
    // engine's SharedArrayBuffer. An SPA push keeps the un-isolated home doc.
    window.location.assign("/analyze");
  };
  return (
    <button
      type="button"
      onClick={open}
      className="inline-flex h-10 items-center gap-2 rounded-md border border-transparent bg-gradient-to-br from-accent-bright to-accent px-5 text-[13.5px] font-medium text-white shadow-[0_6px_18px_-8px_var(--accent)] hover:brightness-110 active:translate-y-px"
    >
      Try an example game →
    </button>
  );
}
