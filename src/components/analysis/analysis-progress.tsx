export function AnalysisProgress({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="px-[15px] py-[12px]">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-text-3">
          Analysing game
        </span>
        <span className="text-[11px] tabular-nums text-text-2">
          {done} / {total}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-bg-3">
        <div
          className="h-full rounded-full bg-white transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
