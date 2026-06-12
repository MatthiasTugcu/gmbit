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
    return mate >= 0 ? 0.985 : 0.015;
  }
  const pawns = (cp ?? 0) / 100;
  return 0.5 + 0.5 * Math.tanh(pawns / 4);
}

export function assessLabel(cp?: number, mate?: number): string {
  if (mate !== undefined && mate !== null) {
    if (mate === 0) return "Checkmate.";
    return `Forced mate for ${mate > 0 ? "White" : "Black"}.`;
  }
  const p = (cp ?? 0) / 100;
  const a = Math.abs(p);
  const who = p >= 0 ? "White" : "Black";
  if (a < 0.3) return "The position is equal.";
  if (a < 0.9) return who + " is slightly better.";
  if (a < 2.0) return who + " is clearly better.";
  if (a < 4.0) return who + " has a winning advantage.";
  return who + " is completely winning.";
}
