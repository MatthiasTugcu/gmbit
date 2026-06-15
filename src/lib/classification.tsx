import type { JSX } from "react";
import type { MoveClass } from "@/types/analysis";

/** Small SVG icons used inside the move-class badges. */
const Check = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="5 12 10 17 19 7" />
  </svg>
);

const Crown = (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 8l4 4 5-7 5 7 4-4-2 11H5L3 8z" />
  </svg>
);

const Book = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 7v14" />
    <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
  </svg>
);

const Cross = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

/** Dark badge text for the light green backgrounds (white fails contrast). */
const INK_GREEN = "oklch(0.27 0.06 148)";
/** Dark badge text for the light yellow inaccuracy background. */
const INK_YELLOW = "oklch(0.28 0.05 92)";

export const CLS: Record<
  MoveClass,
  { label: string; sym: string; short: string; icon?: JSX.Element; ink?: string }
> = {
  brilliant:  { label: "Brilliant",  sym: "!!",        short: "!!" },
  great:      { label: "Great",      sym: "!",         short: "!" },
  best:       { label: "Best move",  sym: "\u2713",    short: "\u2713", icon: Crown },
  excellent:  { label: "Excellent",  sym: "\u2713",    short: "\u2713", icon: Check, ink: INK_GREEN },
  good:       { label: "Good",       sym: "\u2713",    short: "\u2713", ink: INK_GREEN },
  book:       { label: "Book",       sym: "\u25CF",    short: "",       icon: Book },
  inaccuracy: { label: "Inaccuracy", sym: "?!",        short: "?!",     ink: INK_YELLOW },
  mistake:    { label: "Mistake",    sym: "?",         short: "?" },
  miss:       { label: "Miss",       sym: "\u2715",    short: "\u2715", icon: Cross },
  blunder:    { label: "Blunder",    sym: "??",        short: "??" },
};

export const CLASS_ORDER: MoveClass[] = [
  "brilliant",
  "great",
  "best",
  "excellent",
  "good",
  "book",
  "inaccuracy",
  "mistake",
  "miss",
  "blunder",
];

export const GRAPH_MARK: Set<MoveClass> = new Set([
  "brilliant",
  "great",
  "miss",
  "inaccuracy",
  "mistake",
  "blunder",
]);

/**
 * Classes that render no badge anywhere — only standout moves get marked.
 * "good"/"excellent" are the unremarkable outcomes, and "good" doubles as the
 * neutral default carried while analysis is still running, so an unanalysed or
 * in-progress move shows nothing rather than a premature ✓.
 */
export const UNMARKED: Set<MoveClass> = new Set<MoveClass>(["good", "excellent"]);
