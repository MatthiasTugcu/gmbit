import { useEffect, useRef } from "react";

interface KeyboardNavOptions {
  ply: number;
  total: number;
  onSeek: (ply: number) => void;
  onFlip: () => void;
  onEscape: () => void;
}

/** Global board navigation: →/Space step forward, ← step back, ↑/Home jump to
 * start, ↓/End to the end, Esc leaves a variation, F flips the board. Typing in
 * an input is ignored.
 * Reads the latest options through a ref so the keydown listener subscribes
 * only once instead of re-binding on every ply change. */
export function useKeyboardNav(options: KeyboardNavOptions) {
  const ref = useRef(options);
  // Keep the ref pointing at the latest options after each commit, so the
  // listener (subscribed once below) always sees current ply/total/handlers.
  useEffect(() => {
    ref.current = options;
  });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const { ply, total, onSeek, onFlip, onEscape } = ref.current;
      if (e.key === "ArrowRight" || e.key === " ") onSeek(ply + 1);
      else if (e.key === "ArrowLeft") onSeek(ply - 1);
      else if (e.key === "ArrowUp" || e.key === "Home") onSeek(0);
      else if (e.key === "ArrowDown" || e.key === "End") onSeek(total);
      else if (e.key === "Escape") {
        onEscape();
        return;
      } else if (e.key === "f" || e.key === "F") {
        onFlip();
        return;
      } else return;
      // Arrow keys and Home/End must not scroll the page while navigating.
      e.preventDefault();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
