import { describe, it, expect } from "bun:test";
import { parseRSSItems } from "../src/lib/rss.js";

const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title>Ekonomi tumbuh</title>
    <link>https://contoh.test/a</link>
    <description>Pertumbuhan ekonomi naik.</description>
    <pubDate>Mon, 26 Oct 2026 05:00:00 GMT</pubDate>
  </item>
  <item>
    <title>Hanya judul</title>
    <link>https://contoh.test/b</link>
  </item>
  <item>
    <description>Tanpa judul dan link — harus dilewati</description>
  </item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Berita Atom</title>
    <link href="https://contoh.test/atom-1"/>
    <summary>Ringkasan atom.</summary>
    <updated>2026-10-26T05:00:00Z</updated>
  </entry>
</feed>`;

describe("lib/rss parseRSSItems", () => {
  it("mengurai item RSS 2.0 (judul, url, konten, publishedAt)", () => {
    const items = parseRSSItems(RSS, "contoh");
    expect(items.length).toBe(2); // entri tanpa judul & link dilewati
    expect(items[0].judul).toBe("Ekonomi tumbuh");
    expect(items[0].url).toBe("https://contoh.test/a");
    expect(items[0].konten).toBe("Pertumbuhan ekonomi naik.");
    expect(items[0].publishedAt instanceof Date).toBe(true);
    expect(items[1].konten).toBe(""); // description tidak ada → string kosong
  });

  it("jatuh ke mode Atom (<entry> + link href) bila tidak ada <item>", () => {
    const items = parseRSSItems(ATOM, "contoh");
    expect(items.length).toBe(1);
    expect(items[0].judul).toBe("Berita Atom");
    expect(items[0].url).toBe("https://contoh.test/atom-1");
    expect(items[0].konten).toBe("Ringkasan atom.");
    expect(items[0].publishedAt instanceof Date).toBe(true);
  });

  it("mengembalikan array kosong bila tidak ada item sama sekali", () => {
    expect(parseRSSItems("<rss><channel></channel></rss>", "contoh")).toEqual([]);
  });
});
