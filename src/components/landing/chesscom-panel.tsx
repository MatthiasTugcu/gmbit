"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchRecentGames, type RecentGame } from "@/lib/chesscom";
import { parsePgn } from "@/lib/chess-game";
import { savePendingFetch, savePendingPgn } from "@/lib/pending-game";

const GAME_LIMIT = 100;

export function ChesscomPanel() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [games, setGames] = useState<RecentGame[] | null>(null);

  const fetchGames = async () => {
    const name = username.trim();
    if (!name) {
      setError("Enter a chess.com username.");
      return;
    }
    setLoading(true);
    setError(null);
    setGames(null);
    try {
      const fetched = await fetchRecentGames(name, GAME_LIMIT);
      if (fetched.length === 0) {
        setError(`No games found for “${name}”.`);
      } else {
        setGames(fetched);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach chess.com.");
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
    if (games) {
      savePendingFetch(window.sessionStorage, { username: username.trim(), games });
    }
    router.push("/analyze");
  };

  return (
    <div className="rise-in mt-4 w-full rounded-md border border-line bg-bg-1 p-[18px]">
      <label htmlFor="chesscom-username" className="mb-2 block text-[12px] text-text-3">
        Insert your username
      </label>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void fetchGames();
        }}
      >
        <input
          id="chesscom-username"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            if (error) setError(null);
          }}
          spellCheck={false}
          autoFocus
          placeholder="e.g. hikaru"
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
        <div className="mt-2 text-[12px] text-text-3">
          Loading the last {GAME_LIMIT} games…
        </div>
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
  const date = new Date(game.endTime * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  return (
    <li className="flex items-center gap-2.5 px-3 py-2">
      <span className="w-[84px] shrink-0 text-[11.5px] tabular-nums text-text-3">{date}</span>
      <span
        className={`w-[46px] shrink-0 rounded-[5px] px-1.5 py-0.5 text-center text-[11px] font-semibold ${outcome.className}`}
      >
        {outcome.label}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-text">
        {game.white} <span className="text-text-3">vs</span> {game.black}
      </span>
      <span
        className={`w-[52px] shrink-0 rounded-[5px] border px-1.5 py-0.5 text-center text-[10px] font-semibold tracking-wide ${
          game.userSide === "white"
            ? "border-line-2 bg-[oklch(0.95_0.005_288)] text-[oklch(0.18_0.02_288)]"
            : "border-line-2 bg-[oklch(0.18_0.02_288)] text-[oklch(0.95_0.005_288)]"
        }`}
      >
        {game.userSide === "white" ? "WHITE" : "BLACK"}
      </span>
      <button
        type="button"
        onClick={onAnalyze}
        className="h-7 shrink-0 rounded-md border border-transparent bg-gradient-to-br from-accent-bright to-accent px-2.5 text-[11.5px] font-medium text-white hover:brightness-110 active:translate-y-px"
      >
        Analyze
      </button>
    </li>
  );
}
