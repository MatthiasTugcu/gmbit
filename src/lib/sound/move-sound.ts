import type { Move } from "@/types/analysis";

export type SoundName = "move" | "capture";

/** Every move sounds like wood (matching the rest of the piece moves): a
 * capture plays the capture wood-click, anything else — quiet move, castle,
 * promotion, check, or checkmate — plays the move wood-click. Returns null when
 * there is no move (e.g. the start position). */
export function moveSound(move: Move | null): SoundName | null {
  if (!move) return null;
  return move.cap ? "capture" : "move";
}

/** Same resolution from a SAN string, for variation moves which carry only
 * their SAN: a capture ('x') is the capture sound, everything else is move. */
export function soundFromSan(san: string): SoundName {
  return san.includes("x") ? "capture" : "move";
}
