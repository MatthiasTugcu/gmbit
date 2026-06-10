import type { Players } from "@/types/analysis";

function AccuracyBar({
  symbol,
  label,
  pct,
}: {
  symbol: string;
  label: string;
  pct: number;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline gap-[7px]">
        <span className="text-sm leading-none text-text-2">{symbol}</span>
        <span className="text-[21px] font-semibold tracking-tight tabular-nums">{pct}</span>
        <span className="text-[11.5px] text-text-3">%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-bg-3">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent to-accent-bright"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1.5 text-[11.5px] text-text-3">{label}</div>
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
        <AccuracyBar symbol={"\u2654"} label="White" pct={players.white.accuracy} />
        <AccuracyBar symbol={"\u265A"} label="Black" pct={players.black.accuracy} />
      </div>
    </div>
  );
}
