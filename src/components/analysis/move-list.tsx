"use client";

import { useEffect, useRef } from "react";
import type { Move } from "@/types/analysis";
import { CLS } from "@/lib/classification";

interface Props {
  moves: Move[];
  ply: number;
  onSeek: (p: number) => void;
}

function PlyCell({
  m,
  idx,
  active,
  onSeek,
  activeRef,
}: {
  m: Move | undefined;
  idx: number;
  active: boolean;
  onSeek: (p: number) => void;
  activeRef: React.RefObject<HTMLSpanElement | null>;
}) {
  if (!m) return <span />;
  const meta = CLS[m.cls];
  const hasIcon = !!meta.icon;
  const showBadgeText = !hasIcon && !!meta.short;
  const showBadgeDot = !hasIcon && !meta.short;
  return (
    <span
      ref={active ? activeRef : null}
      onClick={() => onSeek(idx + 1)}
      className={`flex cursor-pointer items-center gap-[7px] rounded-md px-2 py-[5px] font-mono text-[13.5px] font-medium text-text transition-colors duration-100 hover:bg-bg-2 ${active ? "bg-accent-soft shadow-[inset_0_0_0_1px_var(--accent-line)]" : ""}`}
    >
      <span className="tabular-nums">
        {m.san}
        {m.check && !m.mateMove ? "+" : ""}
      </span>
      {hasIcon && (
        <span
          className="ml-auto grid h-[17px] w-[17px] place-items-center rounded-full text-white shrink-0"
          style={{ background: `var(--c-${m.cls})` }}
        >
          <span className="grid h-[10px] w-[10px] place-items-center">
            {meta.icon}
          </span>
        </span>
      )}
      {showBadgeText && (
        <span
          className="ml-auto grid h-[17px] w-[17px] place-items-center rounded-full text-[12px] font-extrabold leading-none text-white shrink-0"
          style={{
            background: `var(--c-${m.cls})`,
            color: m.cls === "inaccuracy" ? "oklch(0.28 0.05 92)" : "white",
          }}
        >
          <span className="inline-flex">
            {[...meta.short].map((c, i) => (
              <span key={i} style={i > 0 ? { marginLeft: "-0.15em" } : undefined}>
                {c}
              </span>
            ))}
          </span>
        </span>
      )}
      {showBadgeDot && (
        <span
          className="ml-auto h-[17px] w-[17px] rounded-full shrink-0"
          style={{ background: `var(--c-${m.cls})` }}
        />
      )}
    </span>
  );
}

export function MoveList({ moves, ply, onSeek }: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const el = activeRef.current;
    const box = scrollRef.current;
    if (!el || !box) return;
    const top = el.offsetTop - box.offsetTop;
    if (top < box.scrollTop || top > box.scrollTop + box.clientHeight - 40) {
      box.scrollTop = top - box.clientHeight / 2 + 20;
    }
  }, [ply]);

  const rows: { n: number; w: Move; b: Move | undefined; wi: number; bi: number }[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    rows.push({ n: moves[i].n, w: moves[i], b: moves[i + 1], wi: i, bi: i + 1 });
  }

  return (
    <div className="flex min-h-[132px] flex-1 flex-col px-[15px] py-[14px]">
      <h4 className="mb-[9px] text-[11px] font-semibold uppercase tracking-[0.09em] text-text-3">
        Moves
      </h4>
      <div
        ref={scrollRef}
        className="-mx-1.5 min-h-0 flex-1 overflow-y-auto px-1.5 [&::-webkit-scrollbar]:w-[9px] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-transparent [&::-webkit-scrollbar-thumb]:bg-line-2 [&::-webkit-scrollbar-thumb]:bg-clip-padding [&::-webkit-scrollbar-track]:bg-transparent"
      >
        {rows.map((row) => (
          <div
            key={row.n}
            className="grid grid-cols-[30px_1fr_1fr] items-stretch rounded-md"
          >
            <span className="flex items-center font-mono text-xs tabular-nums text-text-3">
              {row.n}.
            </span>
            <PlyCell
              m={row.w}
              idx={row.wi}
              active={ply === row.wi + 1}
              onSeek={onSeek}
              activeRef={activeRef}
            />
            <PlyCell
              m={row.b}
              idx={row.bi}
              active={ply === row.bi + 1}
              onSeek={onSeek}
              activeRef={activeRef}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
