import { describe, expect, it } from "vitest";
import { extractImageUrl, parseNewsFeed } from "./chess-news";

const feed = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Chess.com News</title>
  <item>
    <title>Nakamura Wins Again &amp; Takes Lead</title>
    <description>Some &amp;#38;nbsp; messy summary</description>
    <link>https://www.chess.com/news/view/a</link>
    <pubDate>Fri, 12 Jun 2026 14:18:27 -0700</pubDate>
  </item>
  <item>
    <title><![CDATA[Carlsen's <Best> Game]]></title>
    <link>https://www.chess.com/news/view/b</link>
    <pubDate>Thu, 11 Jun 2026 09:00:00 -0700</pubDate>
  </item>
</channel></rss>`;

describe("parseNewsFeed", () => {
  it("extracts title, link, and date for each item", () => {
    const items = parseNewsFeed(feed);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("Nakamura Wins Again & Takes Lead");
    expect(items[0].link).toBe("https://www.chess.com/news/view/a");
    expect(items[0].date).toBe(Date.parse("Fri, 12 Jun 2026 14:18:27 -0700"));
  });

  it("strips CDATA and decodes entities in titles", () => {
    expect(parseNewsFeed(feed)[1].title).toBe("Carlsen's <Best> Game");
  });

  it("honours the limit", () => {
    expect(parseNewsFeed(feed, 1)).toHaveLength(1);
  });

  it("skips items without a title or link, and survives an empty feed", () => {
    const partial = `<rss><channel>
      <item><title>No link</title></item>
      <item><link>https://x/y</link></item>
    </channel></rss>`;
    expect(parseNewsFeed(partial)).toEqual([]);
    expect(parseNewsFeed("not xml at all")).toEqual([]);
  });

  it("falls back to date 0 when pubDate is missing or unparseable", () => {
    const f = `<rss><item><title>T</title><link>https://x</link><pubDate>nonsense</pubDate></item></rss>`;
    expect(parseNewsFeed(f)[0].date).toBe(0);
  });

  it("extractImageUrl reads og:image / twitter:image regardless of attribute order", () => {
    expect(
      extractImageUrl('<meta property="og:image" content="https://x/a.png" />'),
    ).toBe("https://x/a.png");
    expect(
      extractImageUrl('<meta content="https://x/b.jpg" name="twitter:image">'),
    ).toBe("https://x/b.jpg");
    expect(extractImageUrl("<html><head></head></html>")).toBeUndefined();
  });

  it("parses Atom entries: href links, alternate rel, and <published> dates", () => {
    const atom = `<feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <published>2026-04-16T04:00:56.541Z</published>
        <link rel="alternate" type="text/html" href="https://lichess.org/@/Lichess/blog/x" />
        <title>Titled Arenas Announcement</title>
      </entry>
    </feed>`;
    const items = parseNewsFeed(atom);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Titled Arenas Announcement");
    expect(items[0].link).toBe("https://lichess.org/@/Lichess/blog/x");
    expect(items[0].date).toBe(Date.parse("2026-04-16T04:00:56.541Z"));
  });
});
