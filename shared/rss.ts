/**
 * rss.ts — parser RSS 2.0 / Atom bersama untuk backend & service crawler.
 *
 * Menggabungkan dua varian yang sebelumnya terpisah:
 *  - backend: RSS 2.0 + fallback Atom
 *  - crawler: RSS 2.0 + decoding CDATA/entitas HTML
 * Hasil gabungan: keduanya mendapat kemampuan lebih lengkap, tanpa dependensi.
 */

export interface RSSItem {
  judul: string;
  url: string;
  konten: string;
  publishedAt: Date | null;
}

/** Ambil isi tag; CDATA dan entitas HTML dasar didekode. */
export function extractTag(xml: string, tag: string): string | null {
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
 * Parse item dari XML RSS 2.0 (`<item>`) atau Atom (`<entry>`).
 * `sumber` dipertahankan di tanda tangan demi kompatibilitas pemanggil lama.
 */
export function parseRSSItems(xml: string, sumber?: string): RSSItem[] {
  const items: RSSItem[] = [];

  // Coba cari <item> (RSS 2.0)
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

  // Jika tidak ada <item>, coba <entry> (Atom)
  if (items.length === 0) {
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
    while ((match = entryRegex.exec(xml)) !== null) {
      const block = match[1];
      const title = extractTag(block, "title");

      // Atom: link href
      const linkMatch = /<link[^>]*href="([^"]*)"/i.exec(block);
      const link = linkMatch ? linkMatch[1] : null;

      const content = extractTag(block, "content") || extractTag(block, "summary");
      const pubDate = extractTag(block, "published") || extractTag(block, "updated");

      if (!title && !link) continue;

      items.push({
        judul: title?.trim() ?? "(tanpa judul)",
        url: link?.trim() ?? "",
        konten: content?.trim() ?? "",
        publishedAt: pubDate ? new Date(pubDate.trim()) : null,
      });
    }
  }

  return items;
}
