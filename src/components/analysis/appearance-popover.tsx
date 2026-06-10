"use client";

import { useEffect, useRef, useState } from "react";
import type { Appearance } from "@/types/analysis";
import { Icons } from "./icons";

interface Props {
  appearance: Appearance;
  setAppearance: (a: Appearance) => void;
}

const BOARDS: { k: Appearance["board"]; name: string; light: string; dark: string }[] = [
  { k: "violet", name: "Violet", light: "oklch(0.36 0.03 292)", dark: "oklch(0.255 0.034 292)" },
  { k: "slate", name: "Slate", light: "oklch(0.66 0.012 250)", dark: "oklch(0.45 0.016 250)" },
  { k: "green", name: "Green", light: "oklch(0.90 0.045 110)", dark: "oklch(0.54 0.075 148)" },
  { k: "walnut", name: "Walnut", light: "oklch(0.76 0.06 70)", dark: "oklch(0.46 0.07 52)" },
];

const SEG_BTN =
  "flex-1 h-8 border-none bg-transparent text-text-2 rounded-[5px] text-[13px] font-medium transition-all duration-150";
const SEG_ON =
  "bg-bg-1 text-text shadow-[0_1px_4px_rgb(0_0_0/0.25)] [.mode-light_&]:shadow-[0_1px_3px_rgb(0_0_0/0.10)]";

export function AppearancePopover({ appearance, setAppearance }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Appearance"
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line-2 bg-bg-2 text-text transition-colors duration-150 hover:border-accent-line active:translate-y-px [&_svg]:h-[18px] [&_svg]:w-[18px]"
      >
        {Icons.gear}
      </button>
      {open && (
        <div className="absolute left-[46px] top-0 z-40 w-[268px] rounded-md border border-line bg-bg-1 p-3.5 shadow-[var(--shadow)]">
          <h4 className="mb-[9px] mt-0.5 text-[11px] font-semibold uppercase tracking-[0.09em] text-text-3">
            Mode
          </h4>
          <div className="flex gap-1 rounded-md bg-bg-3 p-1">
            {(["dark", "light"] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={`${SEG_BTN} ${appearance.mode === m ? SEG_ON : ""}`}
                onClick={() => setAppearance({ ...appearance, mode: m })}
              >
                {m === "dark" ? "Dark" : "Light"}
              </button>
            ))}
          </div>

          <h4 className="mb-[9px] mt-4 text-[11px] font-semibold uppercase tracking-[0.09em] text-text-3">
            Board theme
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {BOARDS.map((b) => {
              const on = appearance.board === b.k;
              return (
                <button
                  key={b.k}
                  type="button"
                  onClick={() => setAppearance({ ...appearance, board: b.k })}
                  className={`flex items-center gap-[9px] rounded-md border bg-bg-2 p-2 text-[12.5px] font-medium transition-all duration-150 ${on ? "border-accent bg-accent-soft text-text" : "border-line text-text-2 hover:border-line-2"}`}
                >
                  <span className="grid h-[26px] w-[26px] shrink-0 grid-cols-2 grid-rows-2 overflow-hidden rounded-[6px] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.15)]">
                    <i style={{ background: b.light }} />
                    <i style={{ background: b.dark }} />
                    <i style={{ background: b.dark }} />
                    <i style={{ background: b.light }} />
                  </span>
                  {b.name}
                </button>
              );
            })}
          </div>

          <h4 className="mb-[9px] mt-4 text-[11px] font-semibold uppercase tracking-[0.09em] text-text-3">
            Coordinates
          </h4>
          <div className="flex gap-1 rounded-md bg-bg-3 p-1">
            <button
              type="button"
              className={`${SEG_BTN} ${appearance.coords ? SEG_ON : ""}`}
              onClick={() => setAppearance({ ...appearance, coords: true })}
            >
              Show
            </button>
            <button
              type="button"
              className={`${SEG_BTN} ${!appearance.coords ? SEG_ON : ""}`}
              onClick={() => setAppearance({ ...appearance, coords: false })}
            >
              Hide
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
