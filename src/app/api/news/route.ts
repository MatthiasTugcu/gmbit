import { extractImageUrl, parseNewsFeed, type NewsItem } from "@/lib/chess-news";

/** Re-fetch the upstream feed at most every 30 minutes. */
export const revalidate = 1800;

const FEED_URL = "https://www.chess.com/rss/news";
const UA = "gmbit/1.0 (+https://github.com/MatthiasTugcu/gmbit)";

/** Fetch an article page and pull out its OpenGraph image; undefined on any failure. */
async function fetchImage(url: string): Promise<string | undefined> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: ctrl.signal,
      next: { revalidate },
    });
    clearTimeout(timer);
    if (!res.ok) return undefined;
    return extractImageUrl(await res.text());
  } catch {
    return undefined;
  }
}

/**
 * Server-side proxy for the Chess.com news RSS feed: the browser can't fetch it
 * directly (no CORS headers), so we fetch + parse here and hand back JSON, then
 * enrich each item with its article image. On any failure we return an empty
 * list with 200 so the panel degrades quietly.
 */
export async function GET() {
  try {
    const res = await fetch(FEED_URL, { headers: { "User-Agent": UA }, next: { revalidate } });
    if (!res.ok) return Response.json({ items: [] });
    const items: NewsItem[] = parseNewsFeed(await res.text(), 8);
    await Promise.all(items.map(async (item) => (item.image = await fetchImage(item.link))));
    return Response.json({ items, source: "Chess.com" });
  } catch {
    return Response.json({ items: [] });
  }
}
