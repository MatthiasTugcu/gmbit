import { formatEval, whiteShare } from "@/lib/eval-format";

interface Props {
  cp?: number;
  mate?: number;
  height: number;
}

export function EvalBar({ cp, mate, height }: Props) {
  const share = whiteShare(cp, mate);
  const txt = formatEval(cp, mate).replace("\u2212", "-").replace(/^\+/, "");
  const whiteAhead = share >= 0.5;
  return (
    <div
      className="relative w-[22px] shrink-0 overflow-hidden border border-line bg-[oklch(0.20_0.02_288)] [.mode-light_&]:bg-[oklch(0.30_0.01_288)]"
      style={{ height }}
    >
      <div
        className="evalbar-fill absolute inset-x-0 bottom-0 bg-gradient-to-t from-[oklch(0.90_0.008_288)] to-[oklch(0.97_0.006_288)] transition-[height] duration-[450ms] ease-[cubic-bezier(.4,.6,.2,1)]"
        style={{ height: `${share * 100}%` }}
      />
      <div className="absolute inset-x-0 top-1/2 h-px bg-accent-line" />
      {whiteAhead ? (
        <div className="absolute inset-x-0 bottom-[3px] text-center text-[9.5px] font-bold tabular-nums text-[oklch(0.20_0.02_288)]">
          {txt}
        </div>
      ) : (
        <div className="absolute inset-x-0 top-[3px] text-center text-[9.5px] font-bold tabular-nums text-[oklch(0.85_0.01_288)]">
          {txt}
        </div>
      )}
    </div>
  );
}
