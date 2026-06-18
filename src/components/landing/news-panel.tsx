"use client";

import { useEffect, useState } from "react";
import type { NewsItem } from "@/lib/chess-news";

/** Compact relative time: "3h ago" / "2d ago", falling back to a short date. */
function relativeTime(ms: number): string {
  if (!ms) return "";
  const diff = Date.now() - ms;
  const min = Math.round(diff / 60000);
  if (min < 60) return `${Math.max(1, min)}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function NewsPanel() {
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/news")
      .then((r) => r.json())
      .then((d: { items?: NewsItem[] }) => active && setItems(d.items ?? []))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, []);

  // Stay invisible if the feed is unreachable or empty — never an empty box.
  if (failed || (items && items.length === 0)) return null;

  // Single-row "shelf": small square tiles in one horizontal track you scroll
  // sideways. snap-x settles the scroll on a card; the fixed card width is
  // narrower than the row, so the next tile peeks at the edge to advertise that
  // there's more to the right.
  const track = "flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2";
  const card = "w-[150px] shrink-0 snap-start";

  return (
    <section className="w-full">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-text-3">
          Chess news
        </span>
        <span className="text-[10.5px] text-text-3">via Chess.com</span>
      </div>

      {items === null ? (
        <ul className={track}>
          {Array.from({ length: 8 }).map((_, i) => (
            <li key={i} className={card}>
              <div className="overflow-hidden rounded-lg border border-line bg-bg-1">
                <div className="aspect-square w-full bg-bg-3" />
                <div className="space-y-1.5 p-2.5">
                  <div className="h-2.5 w-full rounded bg-bg-3" />
                  <div className="h-2.5 w-2/3 rounded bg-bg-3" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ul className={track}>
          {items.map((item) => (
            <li key={item.link} className={card}>
              <a
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex h-full flex-col overflow-hidden rounded-lg border border-line bg-bg-1 transition-colors hover:border-accent-line"
              >
                {item.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- remote feed thumbnail; next/image would need per-host config
                  <img
                    src={item.image}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="aspect-square w-full object-cover"
                  />
                ) : (
                  <div className="aspect-square w-full bg-bg-3" />
                )}
                <span className="flex flex-1 flex-col gap-1 p-2.5">
                  <span className="line-clamp-2 text-[12px] font-medium leading-snug text-text transition-colors group-hover:text-accent-bright">
                    {item.title}
                  </span>
                  {item.date > 0 && (
                    <span className="mt-auto pt-1 text-[10.5px] tabular-nums text-text-3">
                      {relativeTime(item.date)}
                    </span>
                  )}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
