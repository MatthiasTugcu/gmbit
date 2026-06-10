import type { Engine } from "@/types/analysis";
import { assessLabel, formatEval } from "@/lib/eval-format";

interface Props {
  cp?: number;
  mate?: number;
  engine: Engine;
  /** Current search depth from the live engine, if available. */
  liveDepth?: number;
  /** Nodes per second from the live engine, if available. */
  nps?: number;
  /** Whether an engine result is in yet — controls "thinking…" affordance. */
  thinking?: boolean;
}

function formatNps(nps?: number): string | null {
  if (!nps || nps <= 0) return null;
  if (nps >= 1_000_000) return `${(nps / 1_000_000).toFixed(1)}M nps`;
  if (nps >= 1_000) return `${(nps / 1_000).toFixed(0)}k nps`;
  return `${nps} nps`;
}

export function EvalReadout({ cp, mate, engine, liveDepth, nps, thinking }: Props) {
  const isMate = mate !== undefined && mate !== null;
  const depth = liveDepth ?? engine.depth;
  const npsLabel = formatNps(nps);
  return (
    <div className="rounded-md border border-line bg-bg-1 px-[15px] py-[14px]">
      <div className="flex items-center gap-[14px]">
        <div
          className="font-mono text-[38px] font-semibold leading-none tracking-tight tabular-nums shrink-0"
          style={isMate ? { color: "var(--c-blunder)" } : undefined}
        >
          {thinking && cp === undefined && mate === undefined ? "…" : formatEval(cp, mate)}
        </div>
        <div className="flex min-w-0 flex-col gap-[7px]">
          <div className="text-[13.5px] font-medium leading-tight">
            {thinking && cp === undefined && mate === undefined
              ? "Thinking…"
              : assessLabel(cp, mate)}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 whitespace-nowrap text-[11px] text-text-3">
            {engine.name}
            <span className="rounded-[5px] border border-line px-[7px] py-[2px] font-mono text-[10.5px] text-text-2">
              {engine.kind}
            </span>
            depth {depth}
            {npsLabel && <span className="text-text-3">· {npsLabel}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
