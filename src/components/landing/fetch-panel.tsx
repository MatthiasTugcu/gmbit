"use client";

import { useState } from "react";
import type { RecentGame } from "@/lib/chesscom";
import type { AnalysisMode } from "@/types/analysis";
import { parsePgn } from "@/lib/chess-game";
import { savePendingFetch, savePendingMeta, savePendingMode, savePendingPgn } from "@/lib/pending-game";
import { loadUsername, saveUsername, type FetchSource } from "@/lib/landing-prefs";
import { timeControlLabel } from "@/lib/time-control";
import { SideSquare } from "@/components/landing/side-square";
import { TimeControlIcon } from "@/components/landing/time-control-icon";

const GAME_LIMIT = 100;

interface Props {
  source: FetchSource;
  /** Human label, e.g. "chess.com". */
  label: string;
  placeholder: string;
  fetchGames: (username: string, limit: number) => Promise<RecentGame[]>;
  /** Analysis effort to hand off with the chosen game. */
  mode: AnalysisMode;
}

export function FetchPanel({ source, label, placeholder, fetchGames, mode }: Props) {
  const [username, setUsername] = useState(() =>
    typeof window === "undefined" ? "" : loadUsername(window.localStorage, source),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [games, setGames] = useState<RecentGame[] | null>(null);

  const runFetch = async () => {
    const name = username.trim();
    if (!name) {
      setError(`Enter a ${label} username.`);
      return;
    }
    setLoading(true);
    setError(null);
    setGames(null);
    try {
      const fetched = await fetchGames(name, GAME_LIMIT);
      if (fetched.length === 0) {
        setError(`No games found for "${name}".`);
      } else {
        setGames(fetched);
        saveUsername(window.localStorage, source, name);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not reach ${label}.`);
    } finally {
      setLoading(false);
    }
  };

  const analyze = (g: RecentGame) => {
    try {
      parsePgn(g.pgn);
    } catch {
      setError("That game's PGN could not be parsed.");
      return;
    }
    savePendingPgn(window.sessionStorage, g.pgn);
    savePendingMode(window.sessionStorage, mode);
    savePendingMeta(window.sessionStorage, { source, outcome: g.outcome });
    if (games) {
      savePendingFetch(window.sessionStorage, { username: username.trim(), games, source });
    }
    // Full navigation so /analyze loads cross-origin-isolated (threaded engine).
    window.location.assign("/analyze");
  };

  return (
    <div className="rise-in mt-4 w-full rounded-md border border-line bg-bg-1 p-[18px]">
      <label htmlFor="fetch-username" className="mb-2 block text-[12px] text-text-3">
        Insert your {label} username
      </label>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void runFetch();
        }}
      >
        <input
          id="fetch-username"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            if (error) setError(null);
          }}
          spellCheck={false}
          autoFocus
          placeholder={placeholder}
          className="h-9 w-full rounded-md border border-line bg-bg-2 px-3 text-[13px] text-text outline-none placeholder:text-text-3/70 focus:border-accent"
        />
        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-transparent bg-gradient-to-br from-accent-bright to-accent px-[15px] text-[13px] font-medium text-white shadow-[0_6px_18px_-8px_var(--accent)] hover:brightness-110 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Fetching…" : "Fetch"}
        </button>
      </form>

      {error && (
        <div className="mt-2 text-[12px]" style={{ color: "var(--c-blunder)" }}>
          {error}
        </div>
      )}
      {loading && (
        <div className="mt-2 text-[12px] text-text-3">Loading the last {GAME_LIMIT} games…</div>
      )}

      {games && (
        <div className="mt-3">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.09em] text-text-3">
            Last {games.length} games
          </div>
          <ul className="max-h-[340px] divide-y divide-line overflow-y-auto rounded-md border border-line bg-bg-2">
            {games.map((g, i) => (
              <GameRow key={`${g.endTime}-${i}`} game={g} onAnalyze={() => analyze(g)} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const OUTCOME_STYLE: Record<RecentGame["outcome"], { label: string; className: string }> = {
  won: { label: "Won", className: "bg-emerald-400/15 text-emerald-300" },
  lost: { label: "Lost", className: "bg-red-400/15 text-red-300" },
  draw: { label: "Draw", className: "bg-bg-3 text-text-3" },
};

function GameRow({ game, onAnalyze }: { game: RecentGame; onAnalyze: () => void }) {
  const outcome = OUTCOME_STYLE[game.outcome];
  const timeControl = timeControlLabel(game.pgn);
  const date = new Date(game.endTime * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  return (
    <li>
      <button
        type="button"
        onClick={onAnalyze}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-bg-3"
      >
        <span className="w-[84px] shrink-0 text-[11.5px] tabular-nums text-text-3">{date}</span>
        <span
          className={`w-[46px] shrink-0 rounded-[5px] px-1.5 py-0.5 text-center text-[11px] font-semibold ${outcome.className}`}
        >
          {outcome.label}
        </span>
        {timeControl && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-[5px] border border-line bg-bg-2 px-1.5 py-0.5 text-[10.5px] font-medium text-text-3">
            <TimeControlIcon pgn={game.pgn} />
            {timeControl}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-text">
          <SideSquare side="white" />
          {game.white} <span className="text-text-3">vs</span> <SideSquare side="black" />
          {game.black}
        </span>
      </button>
    </li>
  );
}
