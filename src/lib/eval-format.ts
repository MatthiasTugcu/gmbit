export function formatEval(cp?: number, mate?: number): string {
  if (mate !== undefined && mate !== null) {
    if (mate === 0) return "#";
    return (mate < 0 ? "−" : "") + "M" + Math.abs(mate);
  }
  const pawns = (cp ?? 0) / 100;
  const sign = (cp ?? 0) >= 0 ? "+" : "\u2212";
  return sign + Math.abs(pawns).toFixed(1);
}

// 0..1 share of the bar that is White.
export function whiteShare(cp?: number, mate?: number): number {
  if (mate !== undefined && mate !== null) {
    // Any forced mate fills the bar completely for the mating side.
    return mate > 0 ? 1 : mate < 0 ? 0 : 0.985;
  }
  const pawns = (cp ?? 0) / 100;
  return 0.5 + 0.5 * Math.tanh(pawns / 4);
}
