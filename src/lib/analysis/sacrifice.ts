/**
 * Static "did this move give up material" check used to gate Brilliant.
 * One-exchange approximation, not a full SEE — known classics are pinned by
 * tests; subtle compensation cases are out of scope by design.
 */
import { Chess } from "chess.js";
import type { Square } from "chess.js";
import { parseUci } from "@/lib/chess-game";
import type { PieceType } from "@/types/analysis";

const VAL: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export function isSacrifice(fenBefore: string, uci: string): boolean {
  const chess = new Chess(fenBefore);
  const { from, to, promotion } = parseUci(uci);
  const moving = chess.get(from as Square);
  if (!moving) return false;

  const target = chess.get(to as Square);
  let m;
  try {
    m = chess.move({ from: from as Square, to: to as Square, promotion });
  } catch {
    return false;
  }
  if (!m) return false;

  const mover = moving.color;
  const opp = mover === "w" ? "b" : "w";
  const movedVal = VAL[(promotion as PieceType) ?? moving.type];
  // Quiet pawn pushes and minor shuffles can't sacrifice meaningful material.
  if (movedVal < 3) return false;

  // Material gained on the move itself (en passant captures report isCapture
  // with an empty target square — that's a pawn).
  const gained = target ? VAL[target.type] : m.isCapture() ? 1 : 0;

  // Can the opponent profitably take the piece on its new square?
  const attackers = chess.attackers(to as Square, opp);
  if (attackers.length === 0) return false;
  const defenders = chess.attackers(to as Square, mover);

  let oppGain: number;
  if (defenders.length === 0) {
    oppGain = movedVal; // hangs outright
  } else {
    // Defended: opponent's best is cheapest-attacker-takes, we recapture.
    const nonKing = attackers.filter((sq) => chess.get(sq as Square)!.type !== "k");
    if (nonKing.length === 0) return false; // only the king attacks a defended piece
    const cheapest = Math.min(...nonKing.map((sq) => VAL[chess.get(sq as Square)!.type as PieceType]));
    oppGain = movedVal - cheapest;
  }

  return oppGain - gained >= 2; // at least ~2 pawns of net material offered
}
