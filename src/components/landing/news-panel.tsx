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

  return (
    <div className="w-full rounded-md border border-line bg-bg-1 p-[18px]">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-text-3">
          Chess news
        </span>
        <span className="text-[10.5px] text-text-3">via Chess.com</span>
      </div>

      {items === null ? (
        <ul className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <li key={i} className="space-y-1.5">
              <div className="h-3 w-full rounded bg-bg-3" />
              <div className="h-3 w-2/3 rounded bg-bg-3" />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {items.map((item) => (
            <li key={item.link} className="py-2.5 first:pt-0 last:pb-0">
              <a
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex gap-2.5"
              >
                {item.image && (
                  // eslint-disable-next-line @next/next/no-img-element -- remote feed thumbnail; next/image would need per-host config
                  <img
                    src={item.image}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="h-12 w-12 shrink-0 rounded-[5px] border border-line object-cover"
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-[12.5px] leading-snug text-text transition-colors group-hover:text-accent-bright">
                    {item.title}
                  </span>
                  {item.date > 0 && (
                    <span className="mt-1 block text-[11px] tabular-nums text-text-3">
                      {relativeTime(item.date)}
                    </span>
                  )}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
