"use client";

import type { CSSProperties } from "react";
import { Chessboard } from "react-chessboard";
import type { MoveClass, Square } from "@/types/analysis";
import { CLS } from "@/lib/classification";

interface Props {
  position: string;
  flip: boolean;
  showCoords: boolean;
  size: number;
  highlight?: { from: Square; to: Square } | null;
  checkSquare?: Square | null;
  /** Move classification to draw as a badge on `highlight.to`. */
  moveClass?: MoveClass | null;
  /** Currently selected square (click-to-move source). */
  selectedSquare?: Square | null;
  /** Destination squares to mark with legal-move dots. */
  legalTargets?: Square[];
  /** Best-move arrow (engine PV[0]) drawn as a single arrow. */
  bestArrow?: { from: Square; to: Square } | null;
  onPieceDrop?: (from: string, to: string) => boolean;
  onSquareClick?: (square: Square) => void;
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
  selectedSquare,
  legalTargets,
  bestArrow,
  onPieceDrop,
  onSquareClick,
}: Props) {
  const squareStyles: Record<string, CSSProperties> = {};
  if (highlight) {
    squareStyles[highlight.from] = { background: "var(--hl)" };
    squareStyles[highlight.to] = { background: "var(--hl2)" };
  }
  if (selectedSquare) {
    squareStyles[selectedSquare] = {
      ...squareStyles[selectedSquare],
      background: "var(--hl2)",
    };
  }
  if (legalTargets) {
    const dot =
      "radial-gradient(circle at center, var(--dot) 0, var(--dot) 22%, transparent 24%)";
    const capture =
      "radial-gradient(circle at center, transparent 58%, var(--dot) 60%, var(--dot) 78%, transparent 80%)";
    for (const t of legalTargets) {
      // Heuristic: a target marked as the highlight.to of the last move means
      // we shouldn't override. Otherwise pick a "capture ring" when the square
      // already has its own styling (from highlight) — keep it simple here and
      // always draw a centered dot. Captures still register visually because
      // the dot sits over the piece.
      const prev = squareStyles[t]?.background;
      squareStyles[t] = {
        ...squareStyles[t],
        background: prev ? `${dot}, ${prev}` : (prev === undefined ? dot : capture),
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
  if (highlight && moveClass && (CLS[moveClass].icon || CLS[moveClass].sym)) {
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
          animationDurationInMs: 220,
          darkSquareStyle: { backgroundColor: "var(--sq-dark)" },
          lightSquareStyle: { backgroundColor: "var(--sq-light)" },
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
          arrows,
        }}
      />
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
