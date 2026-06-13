"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GmbitLogo } from "@/components/logo";
import { FetchPanel } from "@/components/landing/fetch-panel";
import { parsePgn } from "@/lib/chess-game";
import { fetchRecentGames } from "@/lib/chesscom";
import { fetchLichessGames } from "@/lib/lichess";
import { savePendingMeta, savePendingMode, savePendingPgn } from "@/lib/pending-game";
import { clearHistory, loadHistory, type HistoryEntry } from "@/lib/history";
import type { AnalysisMode } from "@/types/analysis";

type Source = "pgn" | "chesscom" | "lichess";

export function LandingScreen() {
  const router = useRouter();
  const [source, setSource] = useState<Source | null>(null);
  const [mode, setMode] = useState<AnalysisMode>("deep");
  const [pgn, setPgn] = useState("");
  const [pgnError, setPgnError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot read from localStorage on mount
    setHistory(loadHistory(window.localStorage));
  }, []);

  const analyzePgn = () => {
    const trimmed = pgn.trim();
    if (!trimmed) {
      setPgnError("Paste a PGN to analyze.");
      return;
    }
    try {
      const game = parsePgn(trimmed);
      if (game.moves.length === 0) {
        setPgnError("PGN parsed, but contains no moves.");
        return;
      }
    } catch (e) {
      setPgnError(e instanceof Error ? e.message : "Invalid PGN.");
      return;
    }
    savePendingPgn(window.sessionStorage, trimmed);
    savePendingMode(window.sessionStorage, mode);
    savePendingMeta(window.sessionStorage, { source: "pgn" });
    router.push("/analyze");
  };

  const reopen = (entry: HistoryEntry) => {
    savePendingPgn(window.sessionStorage, entry.pgn);
    savePendingMode(window.sessionStorage, mode);
    savePendingMeta(window.sessionStorage, { source: entry.source, outcome: entry.outcome });
    router.push("/analyze");
  };

  const clearAll = () => {
    clearHistory(window.localStorage);
    setHistory([]);
  };

  return (
    <div className="app-root relative z-[1] flex h-screen flex-col overflow-y-auto">
      <div className="flex w-full items-center justify-end px-7 py-4">
        <Link
          href="/features"
          className="text-[13px] font-medium text-text-2 transition-colors hover:text-text"
        >
          How it works →
        </Link>
      </div>
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-14">
        <div className="flex w-full max-w-[640px] flex-col items-center">
          {/* Brand */}
          <GmbitLogo size={88} />
          <h1 className="mt-3 text-[40px] font-extrabold tracking-tight text-text">
            gmbit
          </h1>
          <p className="mt-1.5 text-center text-[14px] text-text-2">
            Free game analysis with engine evaluation — right in your browser.
          </p>

          {/* Source picker */}
          <div className="mt-9 grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
            <SourceCard
              selected={source === "chesscom"}
              onClick={() => setSource("chesscom")}
              icon={
                <svg viewBox="0 0 45 45" className="h-5 w-5" aria-hidden>
                  <path
                    d="m 22.5,9 c -2.21,0 -4,1.79 -4,4 0,0.89 0.29,1.71 0.78,2.38 C 17.33,16.5 16,18.59 16,21 c 0,2.03 0.94,3.84 2.41,5.03 C 15.41,27.09 11,31.58 11,39.5 H 34 C 34,31.58 29.59,27.09 26.59,26.03 28.06,24.84 29,23.03 29,21 29,18.59 27.67,16.5 25.72,15.38 26.21,14.71 26.5,13.89 26.5,13 c 0,-2.21 -1.79,-4 -4,-4 z"
                    fill="#81b64c"
                    stroke="oklch(0.30 0.05 135)"
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                  />
                </svg>
              }
              title="Fetch from Chess.com"
              description="Pull your recent games with just a username."
            />
            <SourceCard
              selected={source === "pgn"}
              onClick={() => setSource("pgn")}
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-amber-300">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="8" y1="13" x2="16" y2="13" />
                  <line x1="8" y1="17" x2="13" y2="17" />
                </svg>
              }
              title="Import a PGN"
              description="Paste a game in PGN notation from any source."
            />
            <SourceCard
              selected={source === "lichess"}
              onClick={() => setSource("lichess")}
              icon={
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-text">
                  <path d="M12 2l2 5 5 1-4 3 1.5 6L12 14l-4.5 3L9 11 5 8l5-1 2-5z" />
                </svg>
              }
              title="Fetch from Lichess"
              description="Pull your recent games with just a username."
            />
          </div>

          {/* Analysis mode picker */}
          <div className="mt-3 grid w-full grid-cols-2 gap-3">
            <ModeButton
              selected={mode === "fast"}
              onClick={() => setMode("fast")}
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-amber-300">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              }
              label="Fast analysis"
            />
            <ModeButton
              selected={mode === "deep"}
              onClick={() => setMode("deep")}
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-amber-300">
                  <circle cx="11" cy="11" r="7" />
                  <line x1="21" y1="21" x2="16" y2="16" />
                </svg>
              }
              label="In-depth analysis"
            />
          </div>

          {/* Source detail panel */}
          {source === "pgn" && (
            <div key="pgn" className="rise-in mt-4 w-full rounded-md border border-line bg-bg-1 p-[18px]">
              <p className="mb-2.5 text-[12px] text-text-3">
                Paste a full PGN — headers optional. The first variation is used.
              </p>
              <textarea
                value={pgn}
                onChange={(e) => {
                  setPgn(e.target.value);
                  if (pgnError) setPgnError(null);
                }}
                spellCheck={false}
                autoFocus
                placeholder={'[Event "..."]\n[White "..."]\n[Black "..."]\n\n1. e4 e5 2. Nf3 Nc6 ...'}
                className="block h-[180px] w-full resize-none rounded-md border border-line bg-bg-2 px-3 py-2.5 font-mono text-[12.5px] leading-[1.55] text-text outline-none placeholder:text-text-3/70 focus:border-accent"
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="min-w-0 text-[12px]" style={{ color: "var(--c-blunder)" }}>
                  {pgnError}
                </div>
                <button
                  type="button"
                  onClick={analyzePgn}
                  className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-transparent bg-gradient-to-br from-accent-bright to-accent px-[15px] text-[13px] font-medium text-white shadow-[0_6px_18px_-8px_var(--accent)] hover:brightness-110 active:translate-y-px"
                >
                  Analyze game
                </button>
              </div>
            </div>
          )}

          {source === "chesscom" && (
            <FetchPanel
              key="chesscom"
              source="chesscom"
              label="chess.com"
              placeholder="e.g. hikaru"
              fetchGames={fetchRecentGames}
              mode={mode}
            />
          )}
          {source === "lichess" && (
            <FetchPanel
              key="lichess"
              source="lichess"
              label="Lichess"
              placeholder="e.g. DrNykterstein"
              fetchGames={fetchLichessGames}
              mode={mode}
            />
          )}

          {history.length > 0 && (
            <div className="mt-8 w-full">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-text-3">
                  Recent analyses
                </span>
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-[11.5px] text-text-3 hover:text-text"
                >
                  Clear
                </button>
              </div>
              <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-bg-1">
                {history.map((entry) => (
                  <li key={entry.pgn} className="flex items-center gap-2.5 px-3 py-2">
                    <span className="w-[44px] shrink-0 text-[10.5px] font-semibold uppercase tracking-wide text-text-3">
                      {entry.source}
                    </span>
                    <button
                      type="button"
                      onClick={() => reopen(entry)}
                      className="min-w-0 flex-1 truncate text-left text-[12.5px] text-text hover:text-accent-bright"
                    >
                      {entry.white} <span className="text-text-3">vs</span> {entry.black}
                    </button>
                    <span className="shrink-0 text-[11px] tabular-nums text-text-3">
                      {new Date(entry.date).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </main>

      <footer className="border-t border-line bg-bg-1/60 px-7 py-5 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1100px] flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="flex items-center gap-2">
            <GmbitLogo size={22} />
            <span className="text-[12.5px] font-semibold tracking-tight text-text">
              gmbit
            </span>
            <span className="text-[12px] text-text-3">
              — chess game analysis
            </span>
          </div>
          <p className="text-[12px] text-text-3">
            Analysis runs locally in your browser. Powered by Stockfish.
          </p>
          <p className="text-[12px] text-text-3">
            © {new Date().getFullYear()} gmbit. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

function SourceCard({
  selected,
  onClick,
  icon,
  title,
  description,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex flex-col items-start gap-1.5 rounded-md border p-3 text-left transition-[border-color,box-shadow,background-color] duration-150 ${
        selected
          ? "border-amber-400 bg-amber-400/15 shadow-[0_0_0_1px_var(--color-amber-400),0_10px_40px_-8px_var(--color-amber-400)]"
          : "border-amber-400/30 bg-amber-400/10 hover:border-amber-400/60"
      }`}
    >
      {icon}
      <span className="text-[13px] font-semibold tracking-tight text-text">
        {title}
      </span>
      <span className="text-[11.5px] leading-[1.5] text-text-3">{description}</span>
    </button>
  );
}

function ModeButton({
  selected,
  onClick,
  icon,
  label,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-md border text-[12.5px] font-medium transition-[border-color,background-color] ${
        selected
          ? "border-accent bg-accent/15 text-text"
          : "border-line bg-bg-1 text-text hover:border-line-2"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
