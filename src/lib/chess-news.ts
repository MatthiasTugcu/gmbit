/**
 * Minimal RSS/Atom parser for the chess-news feed. Kept dependency-free and
 * pure so it's easy to test; the actual network fetch lives in the /api/news
 * route handler (browsers can't fetch the feed directly — no CORS headers).
 */
export interface NewsItem {
  title: string;
  link: string;
  /** Publication time in Unix ms, or 0 when the feed omitted/garbled it. */
  date: number;
  /** Article image (OpenGraph), filled in by the route from the article page. */
  image?: string;
}

/** Pull the OpenGraph (or Twitter) image URL out of an article page's HTML. */
export function extractImageUrl(html: string): string | undefined {
  const tag = html.match(
    /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*>/i,
  )?.[0];
  return tag?.match(/content=["']([^"']+)["']/i)?.[1];
}

/** Decode the handful of XML/HTML entities that show up in feed titles. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/** Inner text of the first `<name>` tag in `block`, CDATA-stripped and decoded. */
function tagText(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  if (!m) return "";
  return decodeEntities(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"));
}

/**
 * Article URL for an entry: RSS uses `<link>url</link>`, Atom a self-closing
 * `<link href="url"/>` (preferring rel="alternate").
 */
function linkOf(block: string): string {
  const text = tagText(block, "link");
  if (text) return text;
  const alt =
    block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i) ??
    block.match(/<link[^>]*href=["']([^"']+)["']/i);
  return alt ? alt[1].trim() : "";
}

/** Publish time in ms from whichever date tag the feed used; 0 if none/garbled. */
function dateOf(block: string): number {
  const raw = tagText(block, "pubDate") || tagText(block, "published") || tagText(block, "updated");
  const parsed = raw ? Date.parse(raw) : NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Parse entries from an RSS (`<item>`) or Atom (`<entry>`) document, in order. */
export function parseNewsFeed(xml: string, limit = 8): NewsItem[] {
  const items: NewsItem[] = [];
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) ?? [];
  for (const block of blocks) {
    const title = tagText(block, "title");
    const link = linkOf(block);
    if (!title || !link) continue;
    items.push({ title, link, date: dateOf(block) });
    if (items.length >= limit) break;
  }
  return items;
}
