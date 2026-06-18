"use client";

import { useEffect, useState } from "react";

// TEMPORARY theme switcher. Flips the whole site between the default purple and
// the experimental blue theme by toggling data-theme on <html>. Persisted to
// localStorage and re-applied before paint via the inline script in layout.tsx.
// Remove this component (and the blue theme block in globals.css) once a theme
// is chosen.
type Theme = "purple" | "blue";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("purple");

  useEffect(() => {
    const current = document.documentElement.dataset.theme === "blue" ? "blue" : "purple";
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot read of the applied theme on mount */
    setTheme(current);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "blue" ? "purple" : "blue";
    setTheme(next);
    if (next === "blue") document.documentElement.dataset.theme = "blue";
    else delete document.documentElement.dataset.theme;
    try {
      window.localStorage.setItem("gmbit-theme", next);
    } catch {
      /* ignore */
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 rounded-md border border-line bg-bg-1/90 px-3 py-2 text-[12px] font-medium text-text-2 shadow-lg backdrop-blur-md transition-colors hover:border-accent-line hover:text-text"
      aria-label="Toggle color theme"
    >
      <span
        className="h-3 w-3 rounded-full"
        style={{ background: "var(--accent)" }}
        aria-hidden
      />
      {theme === "blue" ? "Blue theme" : "Purple theme"}
    </button>
  );
}
