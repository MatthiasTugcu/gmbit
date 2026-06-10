import type { Move, MoveClass } from "@/types/analysis";
import { CLS } from "@/lib/classification";

interface Props {
  move: Move | null;
  showLegend?: boolean;
}

const LEGEND_ORDER: MoveClass[] = [
  "brilliant",
  "best",
  "good",
  "book",
  "inaccuracy",
  "mistake",
  "blunder",
];

export function ClassBar({ move, showLegend }: Props) {
  if (!move) {
    return (
      <div className="px-[15px] py-[14px]">
        <span className="text-[13px] text-text-3">
          Starting position — step forward to begin analysis.
        </span>
      </div>
    );
  }
  const meta = CLS[move.cls];
  const isInaccuracy = move.cls === "inaccuracy";
  return (
    <div className="px-[15px] py-[14px]">
      <div className="flex items-center gap-3">
        <span
          className="grid h-[38px] w-[38px] place-items-center rounded-full text-[17px] font-bold leading-none text-white shrink-0"
          style={{
            background: `var(--c-${move.cls})`,
            color: isInaccuracy ? "oklch(0.28 0.05 92)" : "white",
          }}
        >
          {meta.icon ? (
            <span className="grid h-[20px] w-[20px] place-items-center">
              {meta.icon}
            </span>
          ) : (
            meta.short
          )}
        </span>
        <div className="flex min-w-0 flex-col">
          <span
            className="text-[15px] font-semibold"
            style={{ color: `var(--c-${move.cls})` }}
          >
            {meta.label}
          </span>
          <span className="font-mono text-xs text-text-3">
            <b className="font-semibold text-text-2">
              {move.n}
              {move.c === "w" ? "." : "\u2026"} {move.san}
            </b>
            {move.note ? <>&nbsp;{move.note}</> : null}
          </span>
        </div>
      </div>
      {showLegend && (
        <div className="mt-[11px] flex flex-wrap gap-x-3 gap-y-1.5 border-t border-line pt-[11px]">
          {LEGEND_ORDER.map((k) => (
            <span key={k} className="flex items-center gap-1.5 text-[11px] text-text-2">
              <span
                className="h-3 w-3 rounded-full"
                style={{ background: `var(--c-${k})` }}
              />
              {CLS[k].label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
