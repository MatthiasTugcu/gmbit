import type { Move } from "@/types/analysis";

export type SoundName = "move" | "capture" | "check" | "game-end";

/** Sound for a fully-annotated move. Priority: mate > check > capture > move
 * (a capture-with-check plays the check sound, matching chess.com). Castle and
 * non-capture promotions fall through to "move"; capture-promotions are caught
 * by `cap`. Returns null when there is no move (e.g. the start position). */
export function moveSound(move: Move | null): SoundName | null {
  if (!move) return null;
  if (move.mateMove) return "game-end";
  if (move.check) return "check";
  if (move.cap) return "capture";
  return "move";
}

/** Same categories resolved from a SAN string, for variation moves which carry
 * only their SAN. Same priority order: '#' > '+' > 'x' > quiet. */
export function soundFromSan(san: string): SoundName {
  if (san.includes("#")) return "game-end";
  if (san.includes("+")) return "check";
  if (san.includes("x")) return "capture";
  return "move";
}
