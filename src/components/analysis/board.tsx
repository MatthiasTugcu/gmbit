"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Chessboard, defaultPieces } from "react-chessboard";
import type { MoveClass, Square } from "@/types/analysis";
import { CLS, UNMARKED } from "@/lib/classification";

/** Board move-animation duration; the revive overlay clears after the same span. */
const ANIMATION_MS = 220;

interface Props {
  position: string;
  flip: boolean;
  showCoords: boolean;
  size: number;
  highlight?: { from: Square; to: Square } | null;
  checkSquare?: Square | null;
  /** Move classification to draw as a badge on `highlight.to`. */
  moveClass?: MoveClass | null;
  /** Whether `moveClass` reflects a finished search. Unmarked classes
   * (good/excellent) only badge once analysed, so the running default "good"
   * doesn't paint a premature ✓ on the board. */
  moveAnalyzed?: boolean;
  /** Currently selected square (click-to-move source). */
  selectedSquare?: Square | null;
  /** Destination squares to mark with legal-move dots (ring when a capture). */
  legalTargets?: { square: Square; capture: boolean }[];
  /** Best-move arrow (engine PV[0]) drawn as a single arrow. */
  bestArrow?: { from: Square; to: Square } | null;
  /**
   * A piece to paint immediately on a square while the board animates — used
   * when stepping back over a capture so the recaptured piece reappears at once
   * instead of waiting for react-chessboard's move animation to finish.
   */
  revive?: { square: Square; piece: string; nonce: number } | null;
  /** Wash the board in translucent white (e.g. while exploring a variation). */
  dimmed?: boolean;
  onPieceDrop?: (from: string, to: string) => boolean;
  onSquareClick?: (square: Square) => void;
  /** Fired on press (mousedown), so legal-move dots show the instant a piece is
   * pressed — before any click or drag completes. */
  onSquareMouseDown?: (square: Square) => void;
}

/** Translate a square ("e4") + orientation into pixel coords inside the board. */
function squarePixel(
  square: Square,
  flip: boolean,
  size: number,
): { left: number; top: number; sq: number } {
  const sq = size / 8;
  const file = square.charCodeAt(0) - "a".charCodeAt(0); // 0..7
  const rank = parseInt(square[1], 10) - 1; // 0..7
  const col = flip ? 7 - file : file;
  const row = flip ? rank : 7 - rank;
  return { left: col * sq, top: row * sq, sq };
}

const badgeBaseStyle: CSSProperties = {
  position: "absolute",
  display: "grid",
  placeItems: "center",
  borderRadius: "50%",
  fontWeight: 700,
  color: "white",
  lineHeight: 1,
  boxShadow: "0 4px 12px -2px rgb(0 0 0 / 0.45)",
  pointerEvents: "none",
};

export function Board({
  position,
  flip,
  showCoords,
  size,
  highlight,
  checkSquare,
  moveClass,
  moveAnalyzed,
  selectedSquare,
  legalTargets,
  bestArrow,
  revive,
  dimmed,
  onPieceDrop,
  onSquareClick,
  onSquareMouseDown,
}: Props) {
  // Paint the recaptured piece for one animation span, then drop it — by then
  // react-chessboard has swapped in the real position and rendered it itself.
  const [revived, setRevived] = useState<{ square: Square; piece: string } | null>(null);
  useEffect(() => {
    if (!revive) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- show the overlay the moment a back-step arrives, then retire it
    setRevived({ square: revive.square, piece: revive.piece });
    const t = setTimeout(() => setRevived(null), ANIMATION_MS);
    return () => clearTimeout(t);
  }, [revive?.nonce, revive?.square, revive?.piece, revive]);

  // While off the mainline, lighten the board toward white (chess.com-style) by
  // blending each square colour with white — but only the squares, so the pieces
  // sitting on top stay at full strength.
  const wash = (color: string) =>
    dimmed ? `color-mix(in srgb, ${color}, white 30%)` : color;

  const squareStyles: Record<string, CSSProperties> = {};
  if (highlight) {
    squareStyles[highlight.from] = { background: wash("var(--hl)") };
    squareStyles[highlight.to] = { background: wash("var(--hl2)") };
  }
  if (selectedSquare) {
    squareStyles[selectedSquare] = {
      ...squareStyles[selectedSquare],
      background: wash("var(--hl2)"),
    };
  }
  if (legalTargets) {
    const dot =
      "radial-gradient(circle at center, var(--dot) 0, var(--dot) 22%, transparent 24%)";
    // `closest-side` makes 100% reach the square's edge (default is the farther
    // corner, which pushes the ring outside the square). Kept as a thin band
    // safely inside that edge.
    const capture =
      "radial-gradient(circle closest-side at center, transparent 72%, var(--dot) 74%, var(--dot) 86%, transparent 88%)";
    for (const t of legalTargets) {
      // Empty target squares get a centered dot, occupied ones a capture ring
      // (so the piece underneath stays visible). Layer over any existing
      // highlight background instead of replacing it.
      const mark = t.capture ? capture : dot;
      const prev = squareStyles[t.square]?.background;
      squareStyles[t.square] = {
        ...squareStyles[t.square],
        background: prev ? `${mark}, ${prev}` : mark,
      };
    }
  }
  if (checkSquare) {
    squareStyles[checkSquare] = {
      ...squareStyles[checkSquare],
      background:
        "radial-gradient(circle at center, oklch(0.64 0.21 27 / .55), transparent 66%)",
    };
  }

  const arrows = bestArrow
    ? [
        {
          startSquare: bestArrow.from,
          endSquare: bestArrow.to,
          color: "var(--c-best)",
        },
      ]
    : [];

  // Position the classification badge at the top-right of the destination square.
  let badge: { left: number; top: number; sq: number; cls: MoveClass } | null = null;
  // Marked classes always badge; unmarked (good/excellent) badge on the board
  // once analysed — they stay hidden in the move list (UNMARKED), but the user
  // wants every analysed move marked on the piece.
  const showUnmarked = moveClass ? !UNMARKED.has(moveClass) || !!moveAnalyzed : false;
  if (highlight && moveClass && showUnmarked && (CLS[moveClass].icon || CLS[moveClass].sym)) {
    const p = squarePixel(highlight.to, flip, size);
    const badgeSize = Math.max(18, Math.round(p.sq * 0.36));
    badge = {
      left: p.left + p.sq - badgeSize * 0.55,
      top: p.top - badgeSize * 0.35,
      sq: badgeSize,
      cls: moveClass,
    };
  }

  return (
    <div
      className="relative shrink-0 overflow-visible rounded-md shadow-[0_18px_50px_-20px_rgb(0_0_0/0.7)]"
      style={{ width: size, height: size }}
    >
      <Chessboard
        options={{
          position,
          boardOrientation: flip ? "black" : "white",
          showNotation: showCoords,
          animationDurationInMs: ANIMATION_MS,
          // Pick the piece up (scale-up) the instant it's pressed, instead of
          // waiting for the cursor to move the default 1px first.
          dragActivationDistance: 0,
          // A gentler lift than the default scale(1.2), and hide the faded
          // ghost piece (default opacity 0.5) left in the source square.
          draggingPieceStyle: { transform: "scale(1.08)" },
          draggingPieceGhostStyle: { opacity: 0 },
          darkSquareStyle: { backgroundColor: wash("var(--sq-dark)") },
          lightSquareStyle: { backgroundColor: wash("var(--sq-light)") },
          squareStyles,
          boardStyle: { borderRadius: "var(--r-md)" },
          darkSquareNotationStyle: { color: "var(--coord)", fontSize: 10, fontWeight: 650 },
          lightSquareNotationStyle: { color: "var(--coord)", fontSize: 10, fontWeight: 650 },
          onPieceDrop: onPieceDrop
            ? ({ sourceSquare, targetSquare }) => {
                if (!targetSquare) return false;
                return onPieceDrop(sourceSquare, targetSquare);
              }
            : undefined,
          onSquareClick: onSquareClick
            ? ({ square }) => onSquareClick(square as Square)
            : undefined,
          onSquareMouseDown: onSquareMouseDown
            ? ({ square }) => {
                if (square) onSquareMouseDown(square as Square);
              }
            : undefined,
          arrows,
        }}
      />
      {revived && defaultPieces[revived.piece] && (() => {
        const p = squarePixel(revived.square, flip, size);
        return (
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: p.left,
              top: p.top,
              width: p.sq,
              height: p.sq,
              pointerEvents: "none",
            }}
          >
            {defaultPieces[revived.piece]({ svgStyle: { width: "100%", height: "100%" } })}
          </div>
        );
      })()}
      {badge && (
        <div
          style={{
            ...badgeBaseStyle,
            left: badge.left,
            top: badge.top,
            width: badge.sq,
            height: badge.sq,
            background: `var(--c-${badge.cls})`,
            color: CLS[badge.cls].ink ?? "white",
            fontSize: Math.round(badge.sq * 0.46),
          }}
        >
          {CLS[badge.cls].icon ? (
            <span
              style={{
                display: "grid",
                placeItems: "center",
                width: "62%",
                height: "62%",
              }}
            >
              {CLS[badge.cls].icon}
            </span>
          ) : (
            CLS[badge.cls].sym
          )}
        </div>
      )}
    </div>
  );
}
