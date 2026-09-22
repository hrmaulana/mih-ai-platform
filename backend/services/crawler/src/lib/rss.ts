/**
 * RSS Feed Parser — standalone, no dependencies
 * Extracted from routes/early-warning.ts for the crawler service
 */

export interface RssItem {
  judul: string;
  url: string;
  konten: string;
  publishedAt: Date | null;
}

function extractTag(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = regex.exec(xml);
  if (!m) return null;

  return m[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/**
 * Parse RSS XML into items
 */
export function parseRSSItems(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = extractTag(block, "title");
    const link = extractTag(block, "link");
    const description = extractTag(block, "description");
    const pubDate = extractTag(block, "pubDate");

    if (!title && !link) continue;

    items.push({
      judul: title?.trim() ?? "(tanpa judul)",
      url: link?.trim() ?? "",
      konten: description?.trim() ?? "",
      publishedAt: pubDate ? new Date(pubDate.trim()) : null,
    });
  }

  return items;
}