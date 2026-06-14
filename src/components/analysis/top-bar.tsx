"use client";

import Link from "next/link";
import { GmbitLogo } from "@/components/logo";
import { Wordmark } from "@/components/wordmark";
import type { RecentGame } from "@/lib/chesscom";
import type { PendingFetch } from "@/lib/pending-game";

interface Props {
  /** The chess.com fetch the open game came from; absent for pasted/demo games. */
  recentGames?: PendingFetch;
  /** PGN of the currently open game, to highlight it in the list. */
  activePgn?: string;
  onSelectGame?: (g: RecentGame) => void;
}

/**
 * The whole bar widens on hover (a 72px spacer keeps the layout footprint
 * fixed, so the board never reflows). Collapsed it shows result dots for the
 * player's most recent games; expanded, the clickable game list.
 */
export function TopBar({ recentGames, activePgn, onSelectGame }: Props) {
  const games = recentGames?.games ?? [];
  return (
    <div className="relative z-30 w-[72px] shrink-0">
      <div className="group absolute inset-y-0 left-0 flex w-[72px] flex-col items-center gap-4 overflow-hidden border-r border-line bg-bg-1/80 px-2 py-5 backdrop-blur-md transition-[width] duration-200 hover:w-[280px] hover:bg-bg-1">
        <Link href="/" className="flex flex-col items-center gap-2" title="gmbit home">
          <GmbitLogo size={52} />
          <Wordmark className="text-[13px] font-semibold tracking-tight" />
        </Link>

        {games.length > 0 && (
          <div className="relative min-h-0 flex-1 self-stretch">
            <div className="absolute inset-y-0 left-0 flex w-[56px] flex-col items-center gap-[7px] pt-1 transition-opacity duration-150 group-hover:pointer-events-none group-hover:opacity-0">
              {games.map((g, i) => (
                <span
                  key={`${g.endTime}-${i}`}
                  className={`h-[7px] w-[7px] shrink-0 rounded-full ${DOT_COLOR[g.outcome]}`}
                />
              ))}
            </div>

            <ul className="pointer-events-none absolute inset-y-0 left-0 w-[264px] divide-y divide-line overflow-y-auto opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100">
              {games.map((g, i) => (
                <GameRow
                  key={`${g.endTime}-${i}`}
                  game={g}
                  active={g.pgn === activePgn}
                  onSelect={() => onSelectGame?.(g)}
                />
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

const DOT_COLOR: Record<RecentGame["outcome"], string> = {
  won: "bg-emerald-400",
  lost: "bg-red-400",
  draw: "bg-[oklch(0.55_0.01_288)]",
};

function GameRow({
  game,
  active,
  onSelect,
}: {
  game: RecentGame;
  active: boolean;
  onSelect: () => void;
}) {
  const opponent = game.userSide === "white" ? game.black : game.white;
  const date = new Date(game.endTime * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors duration-100 ${
          active ? "bg-accent/10" : "hover:bg-bg-2"
        }`}
      >
        <span className={`h-[7px] w-[7px] shrink-0 rounded-full ${DOT_COLOR[game.outcome]}`} />
        <span className="min-w-0 flex-1 truncate text-[12px] text-text">
          <span className="text-text-3">vs</span> {opponent}
        </span>
        {active && (
          <span className="shrink-0 text-[9.5px] font-semibold uppercase tracking-wide text-accent-bright">
            open
          </span>
        )}
        <span
          className={`w-[16px] shrink-0 rounded-[4px] border border-line-2 py-0.5 text-center text-[9px] font-semibold ${
            game.userSide === "white"
              ? "bg-[oklch(0.95_0.005_288)] text-[oklch(0.18_0.02_288)]"
              : "bg-[oklch(0.18_0.02_288)] text-[oklch(0.95_0.005_288)]"
          }`}
        >
          {game.userSide === "white" ? "W" : "B"}
        </span>
        <span className="w-[42px] shrink-0 text-right text-[10.5px] tabular-nums text-text-3">
          {date}
        </span>
      </button>
    </li>
  );
}
