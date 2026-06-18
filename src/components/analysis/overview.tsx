import { Fragment } from "react";
import type { Move, MoveClass, Players } from "@/types/analysis";
import { CLS } from "@/lib/classification";

/**
 * Move classes shown in the overview, ordered like the game-summary panel:
 * the headline good moves first, then the costly ones, then the routine rest.
 */
const OVERVIEW_ORDER: MoveClass[] = [
  "brilliant",
  "great",
  "best",
  "mistake",
  "miss",
  "blunder",
  "excellent",
  "good",
  "inaccuracy",
  "book",
];

const WHITE_FILL = "oklch(0.95 0.005 288)";
const BLACK_FILL = "oklch(0.18 0.02 288)";

/** Colored round badge for a move class, sized for the overview rows. */
function ClassBadge({ cls }: { cls: MoveClass }) {
  const meta = CLS[cls];
  return (
    <span
      className="mx-auto grid h-[25px] w-[25px] place-items-center rounded-full"
      style={{ background: `var(--c-${cls})`, color: meta.ink ?? "white" }}
    >
      {meta.icon ? (
        <span className="grid h-[14px] w-[14px] place-items-center">{meta.icon}</span>
      ) : (
        <span className="text-[12px] font-extrabold leading-none tracking-tight">
          {meta.short}
        </span>
      )}
    </span>
  );
}

/** Avatar placeholder: a side-colored tile with the player's initial. */
function Avatar({ side, name }: { side: "white" | "black"; name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || (side === "white" ? "W" : "B");
  return (
    <span
      className="grid h-[46px] w-[46px] place-items-center rounded-[7px] border border-line-2 text-[18px] font-bold"
      style={{
        background: side === "white" ? WHITE_FILL : BLACK_FILL,
        color: side === "white" ? BLACK_FILL : WHITE_FILL,
      }}
    >
      {initial}
    </span>
  );
}

function AccuracyPill({ side, pct }: { side: "white" | "black"; pct: number }) {
  return (
    <span
      className="inline-flex h-9 min-w-[58px] items-center justify-center rounded-[6px] border border-line-2 px-2 text-[15px] font-bold tabular-nums"
      style={{
        background: side === "white" ? WHITE_FILL : BLACK_FILL,
        color: side === "white" ? BLACK_FILL : WHITE_FILL,
      }}
    >
      {pct}
    </span>
  );
}

export function Overview({ moves, players }: { moves: Move[]; players: Players }) {
  const counts = {} as Record<MoveClass, { w: number; b: number }>;
  for (const cls of OVERVIEW_ORDER) counts[cls] = { w: 0, b: 0 };
  for (const m of moves) counts[m.cls][m.c]++;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-[15px] py-[16px] [&::-webkit-scrollbar]:w-[9px] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-transparent [&::-webkit-scrollbar-thumb]:bg-line-2 [&::-webkit-scrollbar-thumb]:bg-clip-padding [&::-webkit-scrollbar-track]:bg-transparent">
      <div className="grid grid-cols-[1fr_64px_38px_64px] items-center gap-x-1.5">
        {/* Players */}
        <span className="text-[14px] font-bold text-text">Players</span>
        <div className="flex flex-col items-center gap-1.5">
          <span className="w-full truncate text-center text-[11.5px] font-semibold text-text-2">
            {players.white.name}
          </span>
          <Avatar side="white" name={players.white.name} />
        </div>
        <span />
        <div className="flex flex-col items-center gap-1.5">
          <span className="w-full truncate text-center text-[11.5px] font-semibold text-text-2">
            {players.black.name}
          </span>
          <Avatar side="black" name={players.black.name} />
        </div>

        {/* Accuracy */}
        <span className="mt-3.5 text-[14px] font-bold text-text">Accuracy</span>
        <div className="mt-3.5 flex justify-center">
          <AccuracyPill side="white" pct={players.white.accuracy} />
        </div>
        <span />
        <div className="mt-3.5 flex justify-center">
          <AccuracyPill side="black" pct={players.black.accuracy} />
        </div>

        <div className="col-span-4 my-3.5 h-px bg-line" />

        {/* Move counts */}
        {OVERVIEW_ORDER.map((cls) => (
          <Fragment key={cls}>
            <span className="py-[7px] text-[14px] font-bold text-text">
              {cls === "best" ? "Best" : CLS[cls].label}
            </span>
            <span
              className="text-center text-[15px] font-bold tabular-nums"
              style={{ color: `var(--c-${cls})` }}
            >
              {counts[cls].w}
            </span>
            <ClassBadge cls={cls} />
            <span
              className="text-center text-[15px] font-bold tabular-nums"
              style={{ color: `var(--c-${cls})` }}
            >
              {counts[cls].b}
            </span>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
