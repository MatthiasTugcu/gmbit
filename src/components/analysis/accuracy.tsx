import type { Players } from "@/types/analysis";

function AccuracyBar({ side, pct }: { side: "white" | "black"; pct: number }) {
  return (
    <div>
      <div className="mb-2">
        <span
          className={`inline-flex h-8 items-center justify-center rounded-[6px] border border-line-2 px-2.5 text-[15px] font-bold tabular-nums ${
            side === "white"
              ? "bg-[oklch(0.95_0.005_288)] text-[oklch(0.18_0.02_288)]"
              : "bg-[oklch(0.18_0.02_288)] text-[oklch(0.95_0.005_288)]"
          }`}
        >
          {pct}%
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-bg-3">
        <div className="h-full rounded-full bg-white" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Accuracy({ players }: { players: Players }) {
  return (
    <div className="px-[15px] py-[14px]">
      <h4 className="mb-[9px] text-[11px] font-semibold uppercase tracking-[0.09em] text-text-3">
        Accuracy
      </h4>
      <div className="grid grid-cols-2 gap-3">
        <AccuracyBar side="white" pct={players.white.accuracy} />
        <AccuracyBar side="black" pct={players.black.accuracy} />
      </div>
    </div>
  );
}
