import type { Players } from "@/types/analysis";

export function PlayersCard({ players }: { players: Players }) {
  const [whiteScore, blackScore] = players.result.split("\u2013");
  return (
    <div className="rounded-md border border-line bg-bg-1 px-[14px] py-3">
      <div className="flex items-center gap-[11px] py-[3px]">
        <span className="w-4 text-center text-[17px] leading-none text-text shrink-0">{"\u265A"}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{players.black.name}</div>
          <div className="text-[11.5px] text-text-3">Black</div>
        </div>
        <span className="ml-auto font-mono text-[13px] font-semibold text-text-2">{blackScore || "0"}</span>
      </div>
      <div className="mt-0.5 flex items-center gap-[11px] py-[3px]">
        <span className="w-4 text-center text-[17px] leading-none text-text shrink-0">{"\u2654"}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{players.white.name}</div>
          <div className="text-[11.5px] text-text-3">White</div>
        </div>
        <span className="ml-auto font-mono text-[13px] font-semibold text-accent-bright">{whiteScore}</span>
      </div>
    </div>
  );
}
