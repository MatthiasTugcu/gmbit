"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import type { AnalysisGame } from "@/lib/chess-game";
import { gameFromAnnotated, playersFromHeaders, tryMove } from "@/lib/chess-game";
import { useEngineEval } from "@/lib/engine/use-engine-eval";
import { useGameAnalysis } from "@/lib/engine/use-game-analysis";
import type { Appearance, Move, Square } from "@/types/analysis";
import { demoMoves, demoPlayers, demoPly } from "@/data/demo-game";

import { TopBar } from "./top-bar";
import { ClassBar } from "./class-bar";
import { BestLine } from "./best-line";
import { MoveList } from "./move-list";
import { Accuracy } from "./accuracy";
import { Controls } from "./controls";
import { Board } from "./board";
import { EvalBar } from "./eval-bar";
import { EvalGraph } from "./eval-graph";
import { PgnImportDialog } from "./pgn-import-dialog";

const APPEARANCE_KEY = "gmbit.appearance";
const PLY_KEY = "gmbit.ply";
const DEFAULT_APPEARANCE: Appearance = { mode: "dark", board: "violet", coords: true };

function loadAppearance(): Appearance {
  if (typeof window === "undefined") return DEFAULT_APPEARANCE;
  try {
    const raw = window.localStorage.getItem(APPEARANCE_KEY);
    if (!raw) return DEFAULT_APPEARANCE;
    const parsed = JSON.parse(raw) as Partial<Appearance>;
    return { ...DEFAULT_APPEARANCE, ...parsed };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

interface Variation {
  baseFen: string; // FEN before the user move (i.e. fens[ply])
  fen: string; // current variation FEN
  history: { from: string; to: string; san: string }[];
}

interface Props {
  initialGame?: AnalysisGame;
}

export function AnalysisScreen({ initialGame }: Props) {
  const [game, setGame] = useState<AnalysisGame>(
    () => initialGame ?? gameFromAnnotated(demoMoves),
  );
  const {
    game: analyzedGame,
    whiteAccuracy,
    blackAccuracy,
    progress: analysisProgress,
  } = useGameAnalysis(game);
  const total = analyzedGame.moves.length;
  // Imported games come with PGN headers; the demo game uses the canned demoPlayers.
  const players = useMemo(() => {
    const base =
      Object.keys(analyzedGame.headers).length > 0
        ? playersFromHeaders(analyzedGame.headers)
        : demoPlayers;
    // Engine-derived accuracy overrides the headers' (always 0) and the demo's baked-in values.
    if (analysisProgress.total === 0) return base;
    return {
      ...base,
      white: { ...base.white, accuracy: whiteAccuracy || base.white.accuracy },
      black: { ...base.black, accuracy: blackAccuracy || base.black.accuracy },
    };
  }, [analyzedGame.headers, analysisProgress.total, whiteAccuracy, blackAccuracy]);

  const [appearance, setAppearance] = useState<Appearance>(DEFAULT_APPEARANCE);
  const [flip, setFlip] = useState(false);
  const [ply, setPly] = useState<number>(Math.min(demoPly, total));
  const [variation, setVariation] = useState<Variation | null>(null);
  const [pgnOpen, setPgnOpen] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);

  useEffect(() => {
    setAppearance(loadAppearance());
    try {
      const stored = window.localStorage.getItem(PLY_KEY);
      if (stored !== null) {
        const p = Number(stored);
        if (!Number.isNaN(p)) setPly(Math.max(0, Math.min(total, p)));
      }
    } catch {
      /* ignore */
    }
    // Run once on mount only — re-running on `total` change would override
    // the import handler's setPly(0) with a stale ply from localStorage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(APPEARANCE_KEY, JSON.stringify(appearance));
    } catch {
      /* ignore */
    }
  }, [appearance]);

  useEffect(() => {
    if (variation) return;
    try {
      window.localStorage.setItem(PLY_KEY, String(ply));
    } catch {
      /* ignore */
    }
  }, [ply, variation]);

  const seek = useCallback(
    (p: number) => {
      setVariation(null);
      setPly(Math.max(0, Math.min(total, p)));
    },
    [total],
  );

  const onPieceDrop = useCallback(
    (from: string, to: string): boolean => {
      // If in a variation, try to extend it.
      if (variation) {
        const moved = tryMove(variation.fen, from, to);
        if (!moved) return false;
        setVariation({
          ...variation,
          fen: moved.fen,
          history: [...variation.history, { from: moved.from, to: moved.to, san: moved.san }],
        });
        return true;
      }
      // Mainline: matches next move? → advance. Otherwise → enter variation.
      const next = analyzedGame.moves[ply];
      if (next && next.from === from && next.to === to) {
        setPly(ply + 1);
        return true;
      }
      const baseFen = analyzedGame.fens[ply];
      const moved = tryMove(baseFen, from, to);
      if (!moved) return false;
      setVariation({
        baseFen,
        fen: moved.fen,
        history: [{ from: moved.from, to: moved.to, san: moved.san }],
      });
      return true;
    },
    [variation, analyzedGame, ply],
  );

  // Keyboard nav.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowRight") seek(ply + 1);
      else if (e.key === "ArrowLeft") seek(ply - 1);
      else if (e.key === "Home") seek(0);
      else if (e.key === "End") seek(total);
      else if (e.key === "Escape") setVariation(null);
      else if (e.key === "f" || e.key === "F") setFlip((f) => !f);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [ply, total, seek]);

  const curMove: Move | null = variation ? null : ply > 0 ? analyzedGame.moves[ply - 1] : null;
  const positionFen = variation ? variation.fen : analyzedGame.fens[ply];

  // Clear selection whenever the position changes (ply step, variation toggle, new game).
  useEffect(() => {
    setSelectedSquare(null);
  }, [positionFen]);

  // Legal-move dots: only when the user has selected a piece.
  const legalTargets = useMemo<Square[]>(() => {
    if (!selectedSquare) return [];
    const c = new Chess(positionFen);
    return c.moves({ square: selectedSquare as never, verbose: true }).map((m) => m.to as Square);
  }, [selectedSquare, positionFen]);

  const onSquareClick = useCallback(
    (sq: Square) => {
      const c = new Chess(positionFen);
      // If we already have a selection, try to move there.
      if (selectedSquare) {
        if (sq === selectedSquare) {
          setSelectedSquare(null);
          return;
        }
        const legal = c
          .moves({ square: selectedSquare as never, verbose: true })
          .some((m) => m.to === sq);
        if (legal) {
          onPieceDrop(selectedSquare, sq);
          setSelectedSquare(null);
          return;
        }
      }
      // Otherwise select the piece on `sq` if it belongs to side-to-move.
      const board = c.board();
      for (const row of board) {
        for (const cell of row) {
          if (cell && cell.square === sq && cell.color === c.turn()) {
            setSelectedSquare(sq);
            return;
          }
        }
      }
      setSelectedSquare(null);
    },
    [positionFen, selectedSquare, onPieceDrop],
  );

  const engineEval = useEngineEval(positionFen, 20);

  // Best-move arrow from the engine's PV[0], e.g. "e2e4" → { from: "e2", to: "e4" }.
  const bestArrow = useMemo<{ from: Square; to: Square } | null>(() => {
    const u = engineEval.bestUci;
    if (!u || u.length < 4) return null;
    return { from: u.slice(0, 2) as Square, to: u.slice(2, 4) as Square };
  }, [engineEval.bestUci]);
  // Prefer live engine numbers; fall back to the move's pre-baked annotation
  // while the engine is still warming up on a new position.
  const curEval = engineEval.hasResult
    ? { cp: engineEval.cp, mate: engineEval.mate }
    : curMove
      ? { cp: curMove.cp, mate: curMove.mate }
      : { cp: 12 };

  // Best line numbering: side-to-move + fullmove number come straight from FEN.
  const fenParts = positionFen.split(" ");
  const stm: "w" | "b" = fenParts[1] === "b" ? "b" : "w";
  const startNumber = Number(fenParts[5]) || 1;
  const lastMove = variation
    ? variation.history.length > 0
      ? variation.history[variation.history.length - 1]
      : null
    : curMove
      ? { from: curMove.from, to: curMove.to }
      : null;

  const checkSquare = useMemo<Square | null>(() => {
    if (variation) {
      const v = new Chess(variation.fen);
      if (!v.inCheck()) return null;
      return findKingSquare(v, v.turn());
    }
    if (!curMove || !curMove.check) return null;
    const c = new Chess(analyzedGame.fens[ply]);
    return findKingSquare(c, c.turn());
  }, [variation, curMove, analyzedGame, ply]);

  // Responsive board/rail sizing — recompute whenever the viewport changes.
  // Sidebar (72) on the left, rail on the right, graph below the board.
  const railWidth = 360;
  const sidebarWidth = 72;
  const graphHeight = 110;
  const [boardSize, setBoardSize] = useState(560);
  const [railHeight, setRailHeight] = useState(620);
  useEffect(() => {
    const calc = () => {
      const h = window.innerHeight - 44 - (graphHeight + 12);
      const w = window.innerWidth - sidebarWidth - 22 - (railWidth + 18) - 52;
      setBoardSize(Math.max(300, Math.min(h, w, 624)));
      setRailHeight(Math.max(420, Math.min(window.innerHeight - 44, 760)));
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  return (
    <div
      className={`app-root relative z-[1] flex h-screen mode-${appearance.mode}`}
      data-board={appearance.board}
    >
      <TopBar
        appearance={appearance}
        setAppearance={setAppearance}
        onImportPgn={() => setPgnOpen(true)}
      />
      <PgnImportDialog
        open={pgnOpen}
        onClose={() => setPgnOpen(false)}
        onImport={(g) => {
          setGame(g);
          setPly(0);
          setVariation(null);
        }}
      />
      <div className="flex min-h-0 flex-1 items-center justify-center gap-[18px] overflow-auto px-[26px] py-[22px]">
        <div className="flex flex-col items-center gap-2">
          {variation && (
            <div
              className="flex items-center gap-3 rounded-md border border-accent-line bg-bg-1 px-3 py-1.5 text-[12.5px] text-text"
              style={{ width: boardSize + 22 + 12 }}
            >
              <span className="flex-1">
                Exploring a <b className="text-accent-bright">variation</b> — not in the game
              </span>
              <button
                type="button"
                onClick={() => setVariation(null)}
                className="h-[26px] rounded-md border border-line-2 bg-bg-2 px-[11px] text-xs font-medium text-text hover:border-accent"
              >
                Return to game
              </button>
            </div>
          )}
          <PlayerStrip
            player={flip ? players.white : players.black}
            width={boardSize + 22 + 12}
          />
          <div className="flex items-stretch gap-3">
            <EvalBar cp={curEval.cp} mate={curEval.mate} height={boardSize} />
            <Board
              position={positionFen}
              size={boardSize}
              flip={flip}
              showCoords={appearance.coords}
              highlight={lastMove}
              checkSquare={checkSquare}
              moveClass={curMove?.cls ?? null}
              selectedSquare={selectedSquare}
              legalTargets={legalTargets}
              bestArrow={bestArrow}
              onPieceDrop={onPieceDrop}
              onSquareClick={onSquareClick}
            />
          </div>
          <PlayerStrip
            player={flip ? players.black : players.white}
            width={boardSize + 22 + 12}
          />
          <EvalGraph
            moves={analyzedGame.moves}
            ply={ply}
            width={boardSize + 22 + 12}
            height={graphHeight}
            onSeek={seek}
          />
        </div>

        <div
          className="flex min-h-0 shrink-0 flex-col divide-y divide-line overflow-hidden rounded-md border border-line bg-bg-1"
          style={{ width: railWidth, height: railHeight }}
        >
          {variation && (
            <div className="px-[15px] py-[14px]">
              <div className="flex items-center gap-3.5">
                <div className="font-mono text-[30px] font-semibold leading-none tabular-nums text-text-3">
                  ?
                </div>
                <div className="flex min-w-0 flex-col gap-[7px]">
                  <div className="text-[13.5px] font-medium leading-tight">
                    Off the analysed line.
                  </div>
                  <div className="text-[11px] text-text-3">
                    Press{" "}
                    <b className="text-accent-bright">&nbsp;Return to game&nbsp;</b> or Esc
                  </div>
                </div>
              </div>
            </div>
          )}
          {analysisProgress.running && analysisProgress.total > 0 && (
            <AnalysisProgress done={analysisProgress.done} total={analysisProgress.total} />
          )}
          <ClassBar move={curMove} showLegend={ply === 0 || curMove?.cls === "brilliant"} />
          <BestLine
            sanLine={engineEval.pvSan}
            startNumber={startNumber}
            startColor={stm}
            emptyLabel={engineEval.hasResult ? "End of game." : "Thinking…"}
          />
          <MoveList moves={analyzedGame.moves} ply={ply} onSeek={seek} />
          <Accuracy players={players} />
          <Controls
            ply={ply}
            total={total}
            onSeek={seek}
            onFlip={() => setFlip((f) => !f)}
          />
        </div>
      </div>
    </div>
  );
}

function PlayerStrip({
  player,
  width,
}: {
  player: { name: string; rating: number | null; side: "White" | "Black" };
  width: number;
}) {
  const isWhite = player.side === "White";
  return (
    <div className="flex items-center gap-2.5 px-1 py-1" style={{ width }}>
      <span
        className="h-3 w-3 rounded-full border border-line-2"
        style={{ background: isWhite ? "oklch(0.95 0.005 288)" : "oklch(0.18 0.02 288)" }}
        aria-hidden
      />
      <div className="min-w-0 flex-1 truncate text-[13px] font-medium text-text">
        {player.name}
      </div>
      {player.rating !== null && (
        <span className="rounded-[5px] border border-line px-[7px] py-[2px] font-mono text-[11px] text-text-2">
          {player.rating}
        </span>
      )}
    </div>
  );
}

function AnalysisProgress({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="px-[15px] py-[12px]">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-text-3">
          Analysing game
        </span>
        <span className="text-[11px] tabular-nums text-text-2">
          {done} / {total}
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-bg-3">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent to-accent-bright transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function findKingSquare(chess: Chess, color: "w" | "b"): Square | null {
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (p && p.type === "k" && p.color === color) {
        return p.square as Square;
      }
    }
  }
  return null;
}
