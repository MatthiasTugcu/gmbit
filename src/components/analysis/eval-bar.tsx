import { formatEval, whiteShare } from "@/lib/eval-format";

interface Props {
  cp?: number;
  mate?: number;
  height: number;
  /** Override the White share (0..1). Used for a delivered checkmate, where
   * `mate` alone (0) can't say who won. */
  share?: number;
  /** Board is flipped (spectating as Black) — put Black at the bottom so the
   * bar matches the board orientation. */
  flip?: boolean;
}

export function EvalBar({ cp, mate, height, share: shareOverride, flip = false }: Props) {
  const share = shareOverride ?? whiteShare(cp, mate);
  const txt = formatEval(cp, mate).replace(/^[+−]/, "");
  const whiteAhead = share >= 0.5;
  // Text sits in the leading side's region: dark on the white fill, light on
  // the dark track. The white fill grows from the side the spectator is on —
  // bottom normally, top when flipped — so `atBottom` inverts with `flip`.
  const atBottom = whiteAhead !== flip;
  return (
    <div
      className="relative w-[28px] shrink-0 overflow-hidden border border-line bg-[oklch(0.20_0.02_288)]"
      style={{ height }}
    >
      <div
        className={`evalbar-fill absolute inset-x-0 ${
          flip ? "top-0 bg-gradient-to-b" : "bottom-0 bg-gradient-to-t"
        } from-[oklch(0.90_0.008_288)] to-[oklch(0.97_0.006_288)] transition-[height] duration-[450ms] ease-[cubic-bezier(.4,.6,.2,1)]`}
        style={{ height: `${share * 100}%` }}
      />
      <div
        className={`absolute inset-x-0 text-center text-[9.5px] font-bold tabular-nums ${
          atBottom ? "bottom-[3px]" : "top-[3px]"
        } ${whiteAhead ? "text-[oklch(0.20_0.02_288)]" : "text-[oklch(0.85_0.01_288)]"}`}
      >
        {txt}
      </div>
    </div>
  );
}
