"use client";

import { useState } from "react";
import type { Move } from "@/types/analysis";
import { CLS, GRAPH_MARK, UNMARKED } from "@/lib/classification";
import { formatEval, whiteShare } from "@/lib/eval-format";

interface Props {
  moves: Move[];
  ply: number;
  /** Total width the graph should occupy (matches board width when placed below it). */
  width: number;
  /** Vertical height of the chart area, including chrome. */
  height: number;
  onSeek: (p: number) => void;
}

interface EvalPoint {
  cp?: number;
  mate?: number;
}

const PAD_X = 14;
const PAD_Y = 12;
/** Header strip (label + numeric eval) lives above the SVG. */
const HEADER_H = 24;

export function EvalGraph({ moves, ply, width, height, onSeek }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const W = Math.max(200, width);
  // The SVG sits inside the container's px-2 padding. Its viewBox must match
  // the rendered size exactly: a scaled SVG (preserveAspectRatio="none")
  // misaligns clicks and leaves ghost half-circle repaint artifacts when the
  // move marker jumps.
  const SW = W - 16;
  const chartH = Math.max(60, height - HEADER_H);
  const N = moves.length;

  const evals: EvalPoint[] = [{ cp: 12 }];
  moves.forEach((m) =>
    evals.push(m.mate !== undefined ? { mate: m.mate } : { cp: m.cp }),
  );

  const cy = chartH / 2;
  const xFor = (i: number) => PAD_X + ((SW - 2 * PAD_X) * i) / Math.max(1, N);
  // whiteShare goes 0..1 with 0.5 = even. Top = white winning, bottom = black winning.
  const yFor = (e: EvalPoint) =>
    PAD_Y + (chartH - 2 * PAD_Y) * (1 - whiteShare(e.cp, e.mate));

  const pts: [number, number][] = evals.map((e, i) => [xFor(i), yFor(e)]);
  const linePath = pts
    .map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`)
    .join(" ");
  const areaPath =
    `M${xFor(0)},${cy} ` +
    pts.map((p) => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ") +
    ` L${xFor(N)},${cy} Z`;

  const seekFromX = (clientX: number, rect: DOMRect) => {
    const x = clientX - rect.left;
    const i = Math.round(((x - PAD_X) / (SW - 2 * PAD_X)) * N);
    return Math.max(0, Math.min(N, i));
  };

  const curEval = evals[ply];

  return (
    <div
      className="relative flex shrink-0 flex-col rounded-md border border-line bg-bg-1 px-2 pb-2 pt-2"
      style={{ width: W }}
    >
      <div
        className="flex items-baseline justify-between px-1.5"
        style={{ height: HEADER_H - 4 }}
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-3">
          Eval
        </span>
        <span className="text-[11px] tabular-nums text-text-3">
          {formatEval(curEval.cp, curEval.mate).replace(/^[+−]/, "")}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${SW} ${chartH}`}
        width={SW}
        height={chartH}
        role="img"
        aria-label="Evaluation graph — click to jump to a move"
        className="block cursor-crosshair"
        onClick={(e) =>
          onSeek(seekFromX(e.clientX, e.currentTarget.getBoundingClientRect()))
        }
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const i = seekFromX(e.clientX, e.currentTarget.getBoundingClientRect());
          setHover(i);
        }}
      >
        <defs>
          <linearGradient id="egFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="oklch(0.95 0.01 288)" stopOpacity="0.42" />
            <stop offset="0.5" stopColor="var(--accent)" stopOpacity="0.12" />
            <stop offset="1" stopColor="oklch(0.2 0.02 288)" stopOpacity="0.55" />
          </linearGradient>
        </defs>
        <line
          x1={PAD_X}
          y1={cy}
          x2={SW - PAD_X}
          y2={cy}
          stroke="var(--line-2)"
          strokeWidth="1"
          strokeDasharray="2 4"
        />
        <path d={areaPath} fill="url(#egFill)" />
        <path
          d={linePath}
          fill="none"
          stroke="white"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        {moves.map((m, k) => {
          if (!GRAPH_MARK.has(m.cls)) return null;
          const [x, y] = pts[k + 1];
          return (
            <circle
              key={k}
              cx={x}
              cy={y}
              r="4.2"
              fill={`var(--c-${m.cls})`}
              stroke="var(--bg-1)"
              strokeWidth="1.4"
              className="cursor-pointer hover:brightness-125"
              onClick={(e) => {
                e.stopPropagation();
                onSeek(k + 1);
              }}
              onMouseEnter={() => setHover(k + 1)}
            />
          );
        })}
        <line
          x1={pts[ply][0]}
          y1={PAD_Y - 6}
          x2={pts[ply][0]}
          y2={chartH - PAD_Y + 6}
          stroke="white"
          strokeWidth="1.5"
          pointerEvents="none"
        />
        <circle
          cx={pts[ply][0]}
          cy={pts[ply][1]}
          r="5.5"
          fill="var(--bg-1)"
          stroke="white"
          strokeWidth="2.4"
          pointerEvents="none"
        />
      </svg>
      {hover !== null && (
        <EgTooltip
          moves={moves}
          evals={evals}
          i={hover}
          pts={pts}
          svgWidth={SW}
        />
      )}
    </div>
  );
}

function EgTooltip({
  moves,
  evals,
  i,
  pts,
  svgWidth,
}: {
  moves: Move[];
  evals: EvalPoint[];
  i: number;
  pts: [number, number][];
  svgWidth: number;
}) {
  const m = i > 0 ? moves[i - 1] : null;
  const e = evals[i];
  const label = i === 0 ? "Start" : `${m!.n}${m!.c === "w" ? "." : "\u2026"} ${m!.san}`;
  // pts are SVG coords; the SVG sits 8px (px-2/pt-2) plus the header strip
  // inside the container. Clamp horizontally so the centered tooltip can't
  // spill past the container edges near the first/last plies.
  const left = Math.max(44, Math.min(pts[i][0] + 8, svgWidth - 28));
  const top = 8 + (HEADER_H - 4) + Math.max(0, pts[i][1] - 12);
  return (
    <div
      className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-md border border-line-2 bg-bg-3 px-[9px] py-1.5 text-[11.5px] text-text shadow-[var(--shadow)] whitespace-nowrap"
      style={{ left, top }}
    >
      <span className="font-mono font-semibold">{label}</span>
      &nbsp;<span className="tabular-nums text-text-2">{formatEval(e.cp, e.mate).replace(/^[+−]/, "")}</span>
      {m && !UNMARKED.has(m.cls) && (
        <div className="mt-0.5 text-[11px]" style={{ color: `var(--c-${m.cls})` }}>
          {CLS[m.cls].label}
        </div>
      )}
    </div>
  );
}
