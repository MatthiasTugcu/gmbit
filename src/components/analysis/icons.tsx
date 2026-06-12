import type { JSX } from "react";

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const Icons: Record<
  "first" | "prev" | "next" | "last" | "flip" | "importPgn",
  JSX.Element
> = {
  first: (
    <svg {...base} strokeWidth={2.1}>
      <polyline points="11 19 4 12 11 5" />
      <polyline points="20 19 13 12 20 5" />
    </svg>
  ),
  prev: (
    <svg {...base} strokeWidth={2.1}>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  ),
  next: (
    <svg {...base} strokeWidth={2.1}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  last: (
    <svg {...base} strokeWidth={2.1}>
      <polyline points="13 5 20 12 13 19" />
      <polyline points="4 5 11 12 4 19" />
    </svg>
  ),
  flip: (
    <svg {...base} strokeWidth={2.1}>
      <polyline points="17 2 21 6 17 10" />
      <path d="M3 12V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 22 3 18 7 14" />
      <path d="M21 12v3a4 4 0 0 1-4 4H3" />
    </svg>
  ),
  importPgn: (
    <svg {...base} strokeWidth={2}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
};
