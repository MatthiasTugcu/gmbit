"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import type { AnalysisGame } from "@/lib/chess-game";
import { computeMaterial } from "@/lib/material";
import {
  findKingSquare,
  gameFromAnnotated,
  pieceCodeAt,
  playersFromHeaders,
  tryMove,
} from "@/lib/chess-game";
import { clockAtPly, formatClock, timeControlBaseSeconds } from "@/lib/clock";
import { moveSound, soundFromSan, type SoundName } from "@/lib/sound/move-sound";
import { playSound, preloadSounds } from "@/lib/sound/player";
import { loadMuted, saveMuted } from "@/lib/sound/sound-prefs";
import type { RecentGame } from "@/lib/chesscom";
import type { PendingFetch } from "@/lib/pending-game";
import { loadPly, savePly } from "@/lib/ply-storage";
import { updateAnalysis } from "@/lib/history";
import { useEngineEval } from "@/lib/engine/use-engine-eval";
import { useGameAnalysis } from "@/lib/engine/use-game-analysis";
import type { AnalysisMode } from "@/types/analysis";
import type { Move, Square } from "@/types/analysis";
import { demoMoves, demoPlayers, demoPly } from "@/data/demo-game";

import { TopBar } from "./top-bar";
import { ClassBar } from "./class-bar";
import { BestLine } from "./best-line";
import { MoveList } from "./move-list";
import { Accuracy } from "./accuracy";
import { Overview } from "./overview";
import { Controls } from "./controls";
import { Board } from "./board";
import { EvalBar } from "./eval-bar";
import { EvalGraph } from "./eval-graph";
import { PlayerStrip } from "./player-strip";
import { AnalysisProgress } from "./analysis-progress";
import { LAYOUT, useBoardSize } from "./use-board-size";
import { useKeyboardNav } from "./use-keyboard-nav";

/** Slight white edge shown before any engine number arrives (≈ +0.12). */
const OPENING_DEFAULT_CP = 12;

interface Variation {
  baseFen: string; // FEN before the user move (i.e. fens[ply])
  fen: string; // current variation FEN
  history: { from: string; to: string; san: string }[];
}

interface Props {
  initialGame?: AnalysisGame;
  /** The chess.com fetch the game came from, for the sidebar game switcher. */
  recentGames?: PendingFetch;
  /** PGN of the currently open game, to highlight it in the switcher. */
  activePgn?: string;
  onSelectGame?: (g: RecentGame) => void;
  /** Engine effort chosen on the landing page; defaults to deep. */
  mode?: AnalysisMode;
}

export function AnalysisScreen({ initialGame, recentGames, activePgn, onSelectGame, mode = "deep" }: Props) {
  const [game] = useState<AnalysisGame>(() => initialGame ?? gameFromAnnotated(demoMoves));
  const {
    game: analyzedGame,
    whiteAccuracy,
    blackAccuracy,
    openingName,
    progress: analysisProgress,
    mode: analyzedMode,
  } = useGameAnalysis(game, mode, activePgn);
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
      opening: openingName ?? base.opening,
    };
  }, [analyzedGame.headers, analysisProgress.total, whiteAccuracy, blackAccuracy, openingName]);

  // Once analysis settles (fresh run or cache hit), record the effort + final
  // accuracies on the game's history entry so the recent-games list can show them.
  useEffect(() => {
    if (!activePgn || analysisProgress.running || analysisProgress.total === 0) return;
    updateAnalysis(window.localStorage, activePgn, {
      mode: analyzedMode,
      whiteAccuracy,
      blackAccuracy,
    });
  }, [
    activePgn,
    analyzedMode,
    analysisProgress.running,
    analysisProgress.total,
    whiteAccuracy,
    blackAccuracy,
  ]);

  const [flip, setFlip] = useState(false);
  const [muted, setMuted] = useState(false);
  const toggleMuted = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      saveMuted(window.localStorage, next);
      return next;
    });
  }, []);
  useEffect(() => {
    const stored = loadMuted(window.localStorage);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot read from localStorage on mount
    if (stored) setMuted(true);
    preloadSounds();
  }, []);
  const [panelTab, setPanelTab] = useState<"analysis" | "overview">("analysis");
  // Imported games open at the start; only the demo opens mid-game at its
  // showcase position.
  const [ply, setPly] = useState<number>(initialGame ? 0 : Math.min(demoPly, total));
  const [variation, setVariation] = useState<Variation | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  // When a back-step undoes a capture, hand the board the piece to repaint
  // immediately (react-chessboard won't re-render it until its move animation
  // finishes). The nonce makes repeated back-steps over the same square re-fire.
  const [revive, setRevive] = useState<{ square: Square; piece: string; nonce: number } | null>(
    null,
  );
  const reviveNonce = useRef(0);

  // Play a sound on every position change, both directions, plus variation
  // moves. Keyed on a position signature (not object identity) so the
  // background analysis pass — which swaps `analyzedGame` but not the position —
  // never fires it. The first run (mount) is skipped so the demo/imported game
  // is silent on load.
  const soundSigRef = useRef<string | null>(null);
  useEffect(() => {
    const sig = variation ? `v${variation.history.length}` : `m${ply}`;
    const prev = soundSigRef.current;
    soundSigRef.current = sig;
    if (prev === null || sig === prev || muted) return;
    let name: SoundName | null;
    if (variation) {
      const last = variation.history.at(-1);
      name = last ? soundFromSan(last.san) : null;
    } else {
      name = ply > 0 ? moveSound(analyzedGame.moves[ply - 1]) : null;
    }
    if (name) playSound(name);
  }, [ply, variation, muted, analyzedGame]);

  useEffect(() => {
    // The stored ply is fingerprinted to the game, so a ply saved while
    // browsing an imported game can never land on the wrong move here.
    const stored = loadPly(window.localStorage, game);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot restore from localStorage on mount
    if (stored !== null) setPly(stored);
    // Run once on mount only — re-running on game change would override
    // the import handler's setPly(0).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (variation) return;
    savePly(window.localStorage, game, ply);
  }, [game, ply, variation]);

  const seek = useCallback(
    (p: number) => {
      const target = Math.max(0, Math.min(total, p));
      // Stepping back exactly one move over a capture: tell the board to paint
      // the recaptured piece at once, so it doesn't blink in after the glide.
      if (target === ply - 1) {
        const undone = analyzedGame.moves[ply - 1];
        if (undone?.cap) {
          const code = pieceCodeAt(analyzedGame.fens[target], undone.to);
          if (code) setRevive({ square: undone.to, piece: code, nonce: ++reviveNonce.current });
        }
      }
      setVariation(null);
      setSelectedSquare(null);
      setPly(target);
    },
    [total, ply, analyzedGame],
  );

  const onPieceDrop = useCallback(
    (from: string, to: string): boolean => {
      // Any successful move changes the position, so drop the selection.
      setSelectedSquare(null);
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

  // Keyboard nav: ←/→ step, ↑/Home start, ↓/End end, Esc leaves a variation, F flips.
  useKeyboardNav({
    ply,
    total,
    onSeek: seek,
    onFlip: () => setFlip((f) => !f),
    onEscape: () => {
      setVariation(null);
      setSelectedSquare(null);
    },
  });

  const curMove: Move | null = variation ? null : ply > 0 ? analyzedGame.moves[ply - 1] : null;
  const positionFen = variation ? variation.fen : analyzedGame.fens[ply];
  // One parsed position shared by every read below (legal moves, board scan,
  // checkmate/check detection) — parsing a FEN is the priciest op here, so we
  // do it once per position instead of in each memo. Read-only, so sharing the
  // instance is safe. null only if the FEN somehow fails to parse.
  const chess = useMemo(() => {
    try {
      return new Chess(positionFen);
    } catch {
      return null;
    }
  }, [positionFen]);
  // The opening: don't suggest a "best move" (arrow or line) for either side's
  // first move — ply 0 (White to move) and ply 1 (Black to move).
  const atOpening = !variation && ply <= 1;

  // Per-side clocks at the current ply, when the PGN carried clock annotations.
  const hasClocks = analyzedGame.moves.some((m) => m.clock !== undefined);
  const clockBase = timeControlBaseSeconds(analyzedGame.headers.TimeControl);
  const clockFor = (color: "w" | "b"): string | undefined => {
    if (!hasClocks) return undefined;
    const sec =
      clockAtPly(analyzedGame.moves, ply, color) ??
      clockBase ??
      analyzedGame.moves.find((m) => m.c === color && m.clock !== undefined)?.clock;
    return sec !== undefined ? formatClock(sec) : undefined;
  };
  const whiteClock = clockFor("w");
  const blackClock = clockFor("b");

  // Captured pieces + point advantage at the current position. White captures
  // black pieces (rendered as black icons) and vice versa.
  const material = useMemo(() => computeMaterial(positionFen), [positionFen]);
  const whiteCaptured = material.capturedByWhite.map((t) => `b${t.toUpperCase()}`);
  const blackCaptured = material.capturedByBlack.map((t) => `w${t.toUpperCase()}`);
  const whiteAdvantage = Math.max(0, material.advantage);
  const blackAdvantage = Math.max(0, -material.advantage);

  // Legal-move dots: only when the user has selected a piece.
  const legalTargets = useMemo<{ square: Square; capture: boolean }[]>(() => {
    if (!selectedSquare || !chess) return [];
    return chess
      .moves({ square: selectedSquare as never, verbose: true })
      .map((m) => ({ square: m.to as Square, capture: m.isCapture() || m.isEnPassant() }));
  }, [selectedSquare, chess]);

  // Does `sq` hold a piece of the side to move (i.e. is it selectable)?
  const isOwnPiece = useCallback(
    (sq: Square) => {
      if (!chess) return false;
      for (const row of chess.board()) {
        for (const cell of row) {
          if (cell && cell.square === sq) return cell.color === chess.turn();
        }
      }
      return false;
    },
    [chess],
  );

  // A press selects a piece on mousedown (not mouseup), so legal-move dots show
  // the instant you press — including a press-and-hold before any drag. We then
  // suppress the deselect that the following click would otherwise do on the
  // same square, so the selection survives a plain press-release.
  const selectedOnDown = useRef(false);
  const onSquareMouseDown = useCallback(
    (sq: Square) => {
      // While a piece is selected, a press on a legal target is the start of a
      // click-to-move — leave it to onSquareClick/onPieceDrop, don't reselect.
      if (selectedSquare && sq !== selectedSquare && chess) {
        const legal = chess
          .moves({ square: selectedSquare as never, verbose: true })
          .some((m) => m.to === sq);
        if (legal) return;
      }
      if (sq !== selectedSquare && isOwnPiece(sq)) {
        setSelectedSquare(sq);
        selectedOnDown.current = true;
      }
    },
    [chess, selectedSquare, isOwnPiece],
  );

  const onSquareClick = useCallback(
    (sq: Square) => {
      if (!chess) return;
      // If we already have a selection, try to move there.
      if (selectedSquare) {
        if (sq === selectedSquare) {
          // Keep the selection if this click just selected it on mousedown;
          // otherwise it's a genuine second click → deselect.
          if (selectedOnDown.current) {
            selectedOnDown.current = false;
            return;
          }
          setSelectedSquare(null);
          return;
        }
        const legal = chess
          .moves({ square: selectedSquare as never, verbose: true })
          .some((m) => m.to === sq);
        if (legal) {
          onPieceDrop(selectedSquare, sq);
          setSelectedSquare(null);
          selectedOnDown.current = false;
          return;
        }
      }
      // Otherwise select the piece on `sq` if it belongs to side-to-move.
      selectedOnDown.current = false;
      if (isOwnPiece(sq)) {
        setSelectedSquare(sq);
        return;
      }
      setSelectedSquare(null);
    },
    [chess, selectedSquare, onPieceDrop, isOwnPiece],
  );

  // Pause the live eval while the two-pass game analysis runs: the lite
  // Stockfish build is single-threaded, so a second concurrent search would
  // roughly halve analysis throughput.
  const liveEvalEnabled = !analysisProgress.running;
  const engineEval = useEngineEval(positionFen, 20, liveEvalEnabled);

  // The engine's best move jumps around as the search deepens. Only draw the
  // arrow once it has held steady for a beat, so it stops flickering; clear it
  // immediately when the position changes (bestUci goes undefined) so no stale
  // arrow lingers on the new position.
  const [stableBestUci, setStableBestUci] = useState<string | undefined>(undefined);
  useEffect(() => {
    const u = engineEval.bestUci;
    if (!u) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot clear when the position changes
      setStableBestUci(undefined);
      return;
    }
    const t = setTimeout(() => setStableBestUci(u), 700);
    return () => clearTimeout(t);
  }, [engineEval.bestUci]);

  // Best-move arrow from the (settled) engine PV[0], e.g. "e2e4" → { from: "e2", to: "e4" }.
  const bestArrow = useMemo<{ from: Square; to: Square } | null>(() => {
    if (!stableBestUci || stableBestUci.length < 4) return null;
    return { from: stableBestUci.slice(0, 2) as Square, to: stableBestUci.slice(2, 4) as Square };
  }, [stableBestUci]);
  // Prefer live engine numbers; fall back to the move's pre-baked annotation
  // while the engine is still warming up on a new position.
  const curEval = engineEval.hasResult
    ? { cp: engineEval.cp, mate: engineEval.mate }
    : curMove
      ? { cp: curMove.cp, mate: curMove.mate }
      : { cp: OPENING_DEFAULT_CP };

  // On a delivered checkmate the engine reports an unsigned `mate 0`, so the
  // eval bar can't tell who won. Resolve it from the position: the side to move
  // is the mated one, so the other side wins (full bar in their colour).
  const checkmate = chess?.isCheckmate() ?? false;
  const checkmateShare = checkmate
    ? positionFen.split(" ")[1] === "w"
      ? 0 // White to move and mated → Black won (bar fully Black)
      : 1 // Black to move and mated → White won (bar fully White)
    : undefined;

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
    if (!chess) return null;
    // `chess` is the current position, so it covers both the variation FEN and
    // the mainline FEN at this ply. Variations show check whenever the side to
    // move is in check; the mainline relies on the move's own `check` flag.
    if (variation) {
      if (!chess.inCheck()) return null;
      return findKingSquare(chess, chess.turn());
    }
    if (!curMove || !curMove.check) return null;
    return findKingSquare(chess, chess.turn());
  }, [chess, variation, curMove]);

  const { boardSize, railHeight } = useBoardSize();
  // Width of the board column: eval bar + gap + board.
  const boardColumnWidth = boardSize + LAYOUT.evalBarWidth + LAYOUT.boardGap;

  return (
    <div className="app-root relative z-[1] flex h-screen" data-board="violet">
      <TopBar
        recentGames={recentGames}
        activePgn={activePgn}
        onSelectGame={onSelectGame}
        muted={muted}
        onToggleMute={toggleMuted}
      />
      <div className="flex min-h-0 flex-1 flex-wrap content-center items-center justify-center gap-[18px] overflow-auto px-[26px] py-[22px]">
        <div className="flex flex-col items-center gap-2">
          <PlayerStrip
            player={flip ? players.white : players.black}
            width={boardColumnWidth}
            clock={flip ? whiteClock : blackClock}
            captured={flip ? whiteCaptured : blackCaptured}
            advantage={flip ? whiteAdvantage : blackAdvantage}
          />
          <div className="flex items-stretch gap-3">
            <EvalBar
              cp={checkmate ? undefined : curEval.cp}
              mate={checkmate ? 0 : curEval.mate}
              share={checkmateShare}
              height={boardSize}
              flip={flip}
            />
            <Board
              position={positionFen}
              size={boardSize}
              flip={flip}
              showCoords
              highlight={lastMove}
              checkSquare={checkSquare}
              moveClass={curMove?.cls ?? null}
              moveAnalyzed={!!curMove && (curMove.cp !== undefined || curMove.mate !== undefined)}
              selectedSquare={selectedSquare}
              legalTargets={legalTargets}
              bestArrow={atOpening ? null : bestArrow}
              revive={revive}
              onPieceDrop={onPieceDrop}
              onSquareClick={onSquareClick}
              onSquareMouseDown={onSquareMouseDown}
            />
          </div>
          <PlayerStrip
            player={flip ? players.black : players.white}
            width={boardColumnWidth}
            clock={flip ? blackClock : whiteClock}
            captured={flip ? blackCaptured : whiteCaptured}
            advantage={flip ? blackAdvantage : whiteAdvantage}
          />
          <EvalGraph
            moves={analyzedGame.moves}
            ply={ply}
            width={boardColumnWidth}
            height={LAYOUT.graphHeight}
            onSeek={seek}
          />
        </div>

        <div
          className="flex min-h-0 shrink-0 flex-col divide-y divide-line overflow-hidden rounded-md border border-line bg-bg-1"
          style={{ width: LAYOUT.railWidth, height: railHeight }}
        >
          <div className="flex shrink-0">
            {(["analysis", "overview"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setPanelTab(tab)}
                className={`flex-1 px-[15px] py-[10px] text-[12px] font-semibold capitalize tracking-[0.02em] transition-colors ${
                  panelTab === tab
                    ? "text-text shadow-[inset_0_-2px_0_0_var(--accent)]"
                    : "text-text-3 hover:text-text-2"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          {panelTab === "overview" ? (
            <Overview moves={analyzedGame.moves} players={players} />
          ) : (
          <>
          <div className="px-[15px] py-[11px]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.09em] text-text-3">
              Opening
            </div>
            <div className="mt-0.5 truncate text-[13px] font-medium text-text" title={players.opening}>
              {players.opening}
            </div>
          </div>
          {variation && (
            <div className="px-[15px] py-[14px]">
              <div className="flex items-center gap-3.5">
                <div className="font-mono text-[30px] font-semibold leading-none tabular-nums text-text-3">
                  ?
                </div>
                <div className="flex min-w-0 flex-col gap-[9px]">
                  <div className="text-[13.5px] font-medium leading-tight">
                    Off the analysed line.
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setVariation(null);
                        setSelectedSquare(null);
                      }}
                      className="h-[26px] rounded-md border border-line-2 bg-bg-2 px-[11px] text-xs font-medium text-text hover:border-accent"
                    >
                      Return to game
                    </button>
                    <span className="text-[11px] text-text-3">or Esc</span>
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
            sanLine={atOpening ? [] : engineEval.pvSan}
            startNumber={startNumber}
            startColor={stm}
            emptyLabel={
              atOpening
                ? "Best line hidden for the opening moves."
                : engineEval.hasResult
                  ? "End of game."
                  : liveEvalEnabled
                    ? "Thinking…"
                    : "Waiting for game analysis…"
            }
          />
          <MoveList moves={analyzedGame.moves} ply={ply} onSeek={seek} />
          <Accuracy players={players} />
          <Controls
            ply={ply}
            total={total}
            onSeek={seek}
            onFlip={() => setFlip((f) => !f)}
          />
          </>
          )}
        </div>
      </div>
    </div>
  );
}
