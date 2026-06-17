import { defaultPieces } from "react-chessboard";

/** White outline for black captured pieces, so they read on the dark strip and
 * stay distinct where they overlap. Eight directions for a solid ring. */
const BLACK_PIECE_OUTLINE = ["1px 0", "-1px 0", "0 1px", "0 -1px"]
  .map((o) => `drop-shadow(${o} 0 #fff)`)
  .join(" ");

export function PlayerStrip({
  player,
  width,
  clock,
  captured,
  advantage,
}: {
  player: { name: string; rating: number | null; side: "White" | "Black" };
  width: number;
  /** Formatted clock for this player at the current ply, when the game has clocks. */
  clock?: string;
  /** Piece codes (e.g. "bP") this player has captured, cheapest first. */
  captured?: string[];
  /** This player's material lead in points; 0 when not ahead. */
  advantage?: number;
}) {
  const isWhite = player.side === "White";
  return (
    <div className="flex items-center gap-2.5 px-1 py-1" style={{ width }}>
      <span
        className="h-3 w-3 rounded-full border border-line-2"
        style={{ background: isWhite ? "oklch(0.95 0.005 288)" : "oklch(0.18 0.02 288)" }}
        aria-hidden
      />
      <div className="min-w-0 max-w-[40%] truncate text-[13px] font-medium text-text">
        {player.name}
      </div>
      {player.rating !== null && (
        <span className="shrink-0 rounded-[5px] border border-line px-[7px] py-[2px] font-mono text-[11px] text-text-2">
          {player.rating}
        </span>
      )}
      {captured && captured.length > 0 && (
        <span className="flex shrink-0 items-center">
          {captured.map((code, i) => {
            // Overlap repeats of the same piece (offset enough to still count
            // them); leave a small gap when the piece type changes.
            const marginLeft = i === 0 ? 0 : captured[i - 1] === code ? "-10px" : "2px";
            return (
              <span key={i} className="h-[15px] w-[15px]" style={{ marginLeft }}>
                {/* Render at 2x with a 1px outline, then scale to 0.5 so the
                    outline reads ~0.5px (sub-pixel drop-shadows don't render). */}
                <span
                  style={{
                    display: "block",
                    width: "30px",
                    height: "30px",
                    transform: "scale(0.5)",
                    transformOrigin: "top left",
                    filter: code[0] === "b" ? BLACK_PIECE_OUTLINE : undefined,
                  }}
                >
                  {defaultPieces[code]?.({ svgStyle: { width: "100%", height: "100%" } })}
                </span>
              </span>
            );
          })}
        </span>
      )}
      {advantage !== undefined && advantage > 0 && (
        <span className="shrink-0 text-[11.5px] font-semibold tabular-nums text-text-2">
          +{advantage}
        </span>
      )}
      {clock !== undefined && (
        <span
          className={`ml-auto shrink-0 rounded-[5px] border px-2 py-[3px] font-mono text-[13px] tabular-nums ${
            isWhite
              ? "border-line-2 bg-[oklch(0.95_0.005_288)] text-[oklch(0.18_0.02_288)]"
              : "border-line-2 bg-[oklch(0.18_0.02_288)] text-[oklch(0.95_0.005_288)]"
          }`}
        >
          {clock}
        </span>
      )}
    </div>
  );
}
