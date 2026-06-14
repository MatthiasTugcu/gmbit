import { timeClassFromPgn, type TimeClass } from "@/lib/time-control";

const COLOR: Record<TimeClass, string> = {
  bullet: "text-amber-400",
  blitz: "text-yellow-300",
  rapid: "text-emerald-400",
  daily: "text-orange-300",
};

const LABEL: Record<TimeClass, string> = {
  bullet: "Bullet",
  blitz: "Blitz",
  rapid: "Rapid",
  daily: "Daily",
};

function Glyph({ cls, className }: { cls: TimeClass; className: string }) {
  switch (cls) {
    case "bullet": // a bullet round
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
          <path d="M12 2c2.2 1.8 3.2 4.6 3.2 7.6V16a3.2 3.2 0 0 1-6.4 0V9.6C8.8 6.6 9.8 3.8 12 2z" />
          <rect x="9.2" y="19" width="5.6" height="2.4" rx="1.2" />
        </svg>
      );
    case "blitz": // lightning bolt
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
          <path d="M13 2 4 14h7l-1 8 10-13h-7l0-7z" />
        </svg>
      );
    case "rapid": // stopwatch
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9v4l2.5 1.5" />
          <path d="M9 2h6" />
        </svg>
      );
    case "daily": // calendar
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
          <rect x="4" y="5" width="16" height="16" rx="2" />
          <path d="M4 9h16M8 3v4M16 3v4" />
        </svg>
      );
  }
}

/** Small category icon (bullet/blitz/rapid/daily) for a game's time control. */
export function TimeControlIcon({ pgn, className = "h-3 w-3" }: { pgn: string; className?: string }) {
  const cls = timeClassFromPgn(pgn);
  if (!cls) return null;
  return (
    <span className={`inline-flex shrink-0 ${COLOR[cls]}`} title={LABEL[cls]}>
      <Glyph cls={cls} className={className} />
    </span>
  );
}
