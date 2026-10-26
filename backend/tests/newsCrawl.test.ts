import { describe, it, expect, afterEach } from "bun:test";
import { crawlFeeds, RSS_FEEDS, type RSSFeed } from "../src/lib/newsCrawl.js";

const FEED: RSSFeed = { sumber: "contoh", url: "https://contoh.test/rss" };
const XML_DUA_ITEM = `<rss><channel>
  <item><title>A</title><link>https://contoh.test/1</link><description>satu</description></item>
  <item><title>B</title><link>https://contoh.test/2</link><description>dua</description></item>
</channel></rss>`;

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubFetch(impl: (url: any) => any) {
  globalThis.fetch = impl as typeof fetch;
}

describe("lib/newsCrawl", () => {
  it("RSS_FEEDS berisi 8 feed dengan sumber & url", () => {
    expect(RSS_FEEDS.length).toBe(8);
    for (const f of RSS_FEEDS) {
      expect(typeof f.sumber).toBe("string");
      expect(f.url.startsWith("https://")).toBe(true);
    }
  });

  it("memproses setiap item lewat onItem dan menghitungnya", async () => {
    stubFetch(async () => ({ ok: true, text: async () => XML_DUA_ITEM }));
    const dilihat: string[] = [];
    const res = await crawlFeeds({
      feeds: [FEED],
      onItem: async (item) => {
        dilihat.push(item.judul);
      },
    });
    expect(dilihat.sort()).toEqual(["A", "B"]);
    expect(res.processed).toBe(2);
    expect(res.errors).toBe(0);
  });

  it("menghitung error bila HTTP gagal dan tidak memanggil onItem", async () => {
    stubFetch(async () => ({ ok: false, status: 503, text: async () => "" }));
    let dipanggil = 0;
    const res = await crawlFeeds({
      feeds: [FEED],
      onItem: async () => {
        dipanggil++;
      },
    });
    expect(dipanggil).toBe(0);
    expect(res.processed).toBe(0);
    expect(res.errors).toBe(1);
  });

  it("error pada satu item tidak menghentikan item lain", async () => {
    stubFetch(async () => ({ ok: true, text: async () => XML_DUA_ITEM }));
    const res = await crawlFeeds({
      feeds: [FEED],
      batchSize: 1,
      onItem: async (item) => {
        if (item.judul === "A") throw new Error("gagal proses A");
      },
    });
    expect(res.processed).toBe(1); // B tetap diproses
    expect(res.errors).toBe(1); // A tercatat error
  });

  it("feed tanpa item dihitung sebagai error", async () => {
    stubFetch(async () => ({ ok: true, text: async () => "<rss><channel></channel></rss>" }));
    const res = await crawlFeeds({ feeds: [FEED], onItem: async () => {} });
    expect(res.errors).toBe(1);
    expect(res.processed).toBe(0);
  });
});
