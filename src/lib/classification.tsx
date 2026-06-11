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
    <path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z" />
    <path d="M20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z" />
  </svg>
);

const Star = (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2l-6.1 3.4 1.4-6.8L2.2 9.1l6.9-.8L12 2z" />
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
  great:      { label: "Great",      sym: "!",         short: "!",      icon: Star },
  best:       { label: "Best move",  sym: "\u2713",    short: "\u2713", icon: Crown },
  excellent:  { label: "Excellent",  sym: "\u2713",    short: "\u2713", icon: Check, ink: INK_GREEN },
  good:       { label: "Good",       sym: "\u2713",    short: "\u2713", ink: INK_GREEN },
  book:       { label: "Book",       sym: "\u25CF",    short: "",       icon: Book },
  inaccuracy: { label: "Inaccuracy", sym: "?!",        short: "?!",     ink: INK_YELLOW },
  mistake:    { label: "Mistake",    sym: "?",         short: "?" },
  miss:       { label: "Miss",       sym: "\u2715",    short: "\u2715", icon: Cross },
  blunder:    { label: "Blunder",    sym: "??",        short: "??" },
};

export const GRAPH_MARK: Set<MoveClass> = new Set([
  "brilliant",
  "great",
  "miss",
  "inaccuracy",
  "mistake",
  "blunder",
]);
