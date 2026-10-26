/**
 * newsCrawl.ts — daftar feed RSS bersama + kerangka crawl untuk rute berita.
 *
 * Dipakai `routes/early-warning.ts` (tabel early_warnings) dan
 * `routes/pantau-berita.ts` (tabel articles + article_scores). Keduanya
 * sebelumnya menyalin daftar feed dan loop fetch/parse/batch yang sama;
 * yang berbeda hanyalah pemrosesan per-item (dedupe, skor, INSERT),
 * sehingga bagian itu tetap diserahkan lewat `onItem`.
 */

import { parseRSSItems, type RSSItem } from "../../../shared/rss";
import { RSS_FEEDS as SHARED_FEEDS, type RSSFeed } from "../../../shared/news-feeds";

/** Feed RSS aktif (kanonik di shared/news-feeds.ts). */
export const RSS_FEEDS: RSSFeed[] = SHARED_FEEDS;

export type { RSSFeed };

export interface CrawlResult {
  /** Jumlah item yang berhasil diproses `onItem` tanpa error. */
  processed: number;
  /** Jumlah kegagalan (fetch/parse maupun pemrosesan item). */
  errors: number;
}

export interface CrawlOptions {
  feeds?: RSSFeed[];
  /** Maksimum item per feed (default 10). */
  perFeedLimit?: number;
  /** Ukuran batch paralel per feed (default 5). */
  batchSize?: number;
  /** Pemrosesan satu item — dedupe/skor/INSERT ada di pemanggil. */
  onItem: (item: RSSItem, feed: RSSFeed) => Promise<void>;
  /** Dipanggil setiap kali sebuah item/feed gagal (opsional, mis. untuk logging). */
  onError?: (err: unknown, ctx: { feed?: RSSFeed }) => void;
}

const FETCH_TIMEOUT_MS = 15_000;

/**
 * Jalankan crawl untuk daftar feed: fetch → parse → proses per batch.
 * Kegagalan fetch/parse dihitung sebagai error, tidak menghentikan feed lain.
 */
export async function crawlFeeds(opts: CrawlOptions): Promise<CrawlResult> {
  const feeds = opts.feeds ?? RSS_FEEDS;
  const perFeedLimit = opts.perFeedLimit ?? 10;
  const batchSize = opts.batchSize ?? 5;

  let processed = 0;
  let errors = 0;
  const fail = (err: unknown, ctx: { feed?: RSSFeed } = {}) => {
    errors++;
    opts.onError?.(err, ctx);
  };

  await Promise.all(
    feeds.map(async (feed) => {
      try {
        const rssResponse = await fetch(feed.url, {
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!rssResponse.ok) {
          fail(new Error(`HTTP ${rssResponse.status}`), { feed });
          return;
        }
        const rssText = await rssResponse.text();
        const items = parseRSSItems(rssText, feed.sumber).slice(0, perFeedLimit);
        if (items.length === 0) {
          fail(new Error("tidak ada item"), { feed });
          return;
        }

        for (let i = 0; i < items.length; i += batchSize) {
          const batch = items.slice(i, i + batchSize);
          await Promise.all(
            batch.map(async (item) => {
              try {
                await opts.onItem(item, feed);
                processed++;
              } catch (err) {
                fail(err, { feed });
              }
            }),
          );
        }
      } catch (err) {
        fail(err, { feed });
      }
    }),
  );

  return { processed, errors };
}
