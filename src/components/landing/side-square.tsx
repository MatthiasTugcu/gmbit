/** Small inline colour marker shown next to a player's name (light = White, dark = Black). */
export function SideSquare({ side }: { side: "white" | "black" }) {
  return (
    <span
      aria-hidden
      className={`mr-1 inline-block h-2.5 w-2.5 rounded-[2px] border border-line-2 align-[-0.5px] ${
        side === "white" ? "bg-[oklch(0.95_0.005_288)]" : "bg-[oklch(0.18_0.02_288)]"
      }`}
    />
  );
}
