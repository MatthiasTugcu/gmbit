"use client";

import { useEffect, useState } from "react";
import { AnalysisScreen } from "@/components/analysis/analysis-screen";
import { parsePgn, type AnalysisGame } from "@/lib/chess-game";
import type { RecentGame } from "@/lib/chesscom";
import {
  loadPendingFetch,
  loadPendingPgn,
  savePendingPgn,
  type PendingFetch,
} from "@/lib/pending-game";

interface Loaded {
  game: AnalysisGame | undefined;
  pgn: string | null;
  fetch: PendingFetch | null;
}

/**
 * Reads the PGN handed off by the landing page after mount — sessionStorage
 * doesn't exist during SSR — and only then mounts AnalysisScreen, so the
 * engine never starts analysing the demo game just to be torn down when the
 * imported game arrives a frame later.
 *
 * When the pending game came from a chess.com fetch, the rest of that fetch
 * is offered in the sidebar; selecting a game there remounts AnalysisScreen
 * (keyed by PGN) so analysis starts over cleanly.
 */
export function AnalyzeClient() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    const pgn = loadPendingPgn(window.sessionStorage);
    let game: AnalysisGame | undefined;
    if (pgn) {
      try {
        game = parsePgn(pgn);
      } catch {
        // Stored PGN no longer parses — fall back to the demo game.
      }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot read from sessionStorage on mount
    setLoaded({ game, pgn: game ? pgn : null, fetch: loadPendingFetch(window.sessionStorage) });
  }, []);

  if (!loaded) return null;

  const selectGame = (g: RecentGame) => {
    if (g.pgn === loaded.pgn) return;
    let game: AnalysisGame;
    try {
      game = parsePgn(g.pgn);
    } catch {
      return; // unparseable PGN — keep the current game
    }
    savePendingPgn(window.sessionStorage, g.pgn);
    setLoaded({ ...loaded, game, pgn: g.pgn });
  };

  return (
    <AnalysisScreen
      key={loaded.pgn ?? "demo"}
      initialGame={loaded.game}
      recentGames={loaded.fetch ?? undefined}
      activePgn={loaded.pgn ?? undefined}
      onSelectGame={selectGame}
    />
  );
}
