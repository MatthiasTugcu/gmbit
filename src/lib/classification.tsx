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

export const CLS: Record<
  MoveClass,
  { label: string; sym: string; short: string; icon?: JSX.Element }
> = {
  brilliant:  { label: "Brilliant",  sym: "!!",        short: "!!" },
  best:       { label: "Best move",  sym: "\u2713",    short: "\u2713", icon: Crown },
  good:       { label: "Good",       sym: "\u2713",    short: "\u2713", icon: Check },
  book:       { label: "Book",       sym: "\u25CF",    short: "",       icon: Book },
  inaccuracy: { label: "Inaccuracy", sym: "?!",        short: "?!" },
  mistake:    { label: "Mistake",    sym: "?",         short: "?" },
  blunder:    { label: "Blunder",    sym: "??",        short: "??" },
};

export const GRAPH_MARK: Set<MoveClass> = new Set([
  "brilliant",
  "inaccuracy",
  "mistake",
  "blunder",
]);
