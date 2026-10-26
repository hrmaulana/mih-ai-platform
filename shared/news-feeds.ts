/**
 * news-feeds.ts — daftar feed RSS kanonik untuk Pantau Berita / Early Warning.
 *
 * Sebelumnya disalin di backend (routes + lib/newsCrawl) dan service crawler.
 */

export interface RSSFeed {
  sumber: string;
  url: string;
}

export const RSS_FEEDS: RSSFeed[] = [
  { sumber: "cnbc", url: "https://www.cnbcindonesia.com/rss" },
  { sumber: "katadata", url: "https://katadata.co.id/rss" },
  { sumber: "antara", url: "https://www.antaranews.com/rss/ekonomi" },
  { sumber: "tempo-bisnis", url: "https://rss.tempo.co/bisnis" },
  { sumber: "tempo-nasional", url: "https://rss.tempo.co/nasional" },
  { sumber: "liputan6", url: "https://feed.liputan6.com/rss/bisnis" },
  { sumber: "economist", url: "https://www.economist.com/business/rss.xml" },
  { sumber: "politico", url: "https://www.politico.com/rss/politicopicks.xml" },
];
