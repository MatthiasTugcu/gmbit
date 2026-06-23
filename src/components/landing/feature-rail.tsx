"use client";

import type { ReactNode } from "react";
import { CLS } from "@/lib/classification";

interface Feature {
  title: string;
  desc: string;
  icon: ReactNode;
}

/**
 * The things that make gmbit distinctive, shown as larger cards in the landing
 * gutters on wide screens. Split across both flanks (see FeatureColumn) so the
 * centered hero stays evenly framed. Each mirrors a section of /features.
 */
export const FEATURES: Feature[] = [
  {
    title: "Brilliant to blunder",
    desc: "Every move is graded by how much it shifted your winning chances — from a brilliant sacrifice to an outright blunder.",
    icon: <ClassBadges />,
  },
  {
    title: "Accuracy score",
    desc: "Each side gets an accuracy percentage, calibrated against chess.com so the number means what you expect.",
    icon: <PercentIcon />,
  },
  {
    title: "Engine evaluation",
    desc: "A Stockfish eval bar and a swing graph for every position — jump straight to the moments the game turned.",
    icon: <GraphIcon />,
  },
  {
    title: "100% private",
    desc: "The engine runs locally in your browser. No game is ever uploaded — the analysis stays on your machine.",
    icon: <ShieldIcon />,
  },
];

/** One flank of the feature rail: a stacked column of the given tiles. */
export function FeatureColumn({ tiles }: { tiles: Feature[] }) {
  return (
    <div className="flex flex-col gap-5">
      {tiles.map((f) => (
        <Tile key={f.title} {...f} />
      ))}
    </div>
  );
}

function Tile({ title, desc, icon }: Feature) {
  return (
    <section className="rounded-2xl border border-line bg-bg-1/70 p-6 backdrop-blur-sm transition-colors hover:border-line-2">
      <span className="grid h-[52px] w-[52px] place-items-center rounded-2xl bg-bg-3 text-text-2">
        {icon}
      </span>
      <h3 className="mt-4 text-[17px] font-bold tracking-tight text-text">{title}</h3>
      <p className="mt-2 text-[13.5px] leading-[1.55] text-text-3">{desc}</p>
    </section>
  );
}

/** Two move-class badges (brilliant + blunder) reusing the shared palette. */
function ClassBadges() {
  return (
    <span className="flex items-center -space-x-1.5">
      <span
        className="grid h-[23px] w-[23px] place-items-center rounded-full text-[11px] font-extrabold text-white ring-1 ring-bg-3"
        style={{ background: "var(--c-brilliant)" }}
      >
        {CLS.brilliant.short}
      </span>
      <span
        className="grid h-[23px] w-[23px] place-items-center rounded-full text-[11px] font-extrabold text-white ring-1 ring-bg-3"
        style={{ background: "var(--c-blunder)" }}
      >
        {CLS.blunder.short}
      </span>
    </span>
  );
}

function PercentIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" className="h-[25px] w-[25px]">
      <line x1="19" y1="5" x2="5" y2="19" />
      <circle cx="6.5" cy="6.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </svg>
  );
}

function GraphIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-[25px] w-[25px]">
      <path d="M3 14l5-5 4 4 6-7" />
      <path d="M3 20h18" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-[25px] w-[25px]">
      <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
      <path d="M9.5 12l1.8 1.8 3.2-3.6" />
    </svg>
  );
}
