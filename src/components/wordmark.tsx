// The gmbit wordmark: "gm" in the normal text color, "bit" in the magenta
// accent — tying the word to the queen mark and surfacing the GM + bit play.
// Pass `className` to control size/weight per call site (defaults match the
// previous inline styling).
export function Wordmark({
  className = "text-[13px] font-extrabold tracking-tight",
}: {
  className?: string;
}) {
  return (
    <span className={className}>
      <span className="text-text">gm</span>
      <span className="text-accent-bright">bit</span>
    </span>
  );
}
