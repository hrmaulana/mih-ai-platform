/**
 * pantau-berita.ts — API Routes untuk Pantau Berita PKPN
 *
 * Semua endpoint read-only (kecuali /review).
 * Prefix: /api/pantau-berita
 * Auth: requireLogin untuk semua, requireLogin + isAdmin untuk /review POST
 */

import { Router } from "express"
import { pool } from "../db"
import { requireLogin, requireAdmin } from "../middleware/sessionAuth"
import { scoreArticle, hashContent } from "../services/berita-scorer"

const router = Router()

// ===== Helper: Parse R =====

/**
 * Parse RSS/atom XML items dari berbagai sumber
 */
function parseRSSItems(
  xml: string,
  sumber: string,
): { judul: string; url: string; konten: string; publishedAt: Date | null }[] {
  const items: { judul: string; url: string; konten: string; publishedAt: Date | null }[] = []

  // Coba cari <item> (RSS 2.0)
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi
  let match: RegExpExecArray | null

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1]
    const title = extractTag(block, "title")
    const link = extractTag(block, "link")
    const description = extractTag(block, "description")
    const pubDate = extractTag(block, "pubDate")

    if (!title && !link) continue

    items.push({
      judul: title?.trim() ?? "(tanpa judul)",
      url: link?.trim() ?? "",
      konten: description?.trim() ?? "",
      publishedAt: pubDate ? new Date(pubDate.trim()) : null,
    })
  }

  // Jika tidak ada <item>, coba <entry> (Atom)
  if (items.length === 0) {
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi
    while ((match = entryRegex.exec(xml)) !== null) {
      const block = match[1]
      const title = extractTag(block, "title")

      // Atom: link href
      const linkMatch = /<link[^>]*href="([^"]*)"/i.exec(block)
      const link = linkMatch ? linkMatch[1] : null

      const content = extractTag(block, "content") || extractTag(block, "summary")
      const pubDate = extractTag(block, "published") || extractTag(block, "updated")

      if (!title && !link) continue

      items.push({
        judul: title?.trim() ?? "(tanpa judul)",
        url: link?.trim() ?? "",
        konten: content?.trim() ?? "",
        publishedAt: pubDate ? new Date(pubDate.trim()) : null,
      })
    }
  }

  return items
}

function extractTag(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i")
  const m = regex.exec(xml)
  if (!m) return null

  return m[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

// ===== Endpoints =====

/**
 * GET /api/pantau-berita/ringkasan-klaster
 * Ringkasan klaster PKPN: jumlah artikel per klaster (top 8)
 */
router.get("/pantau-berita/ringkasan-klaster", requireLogin, async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        unnest(klaster_pkpn) AS klaster,
        COUNT(*) AS jumlah_artikel,
        COUNT(*) FILTER (WHERE dampak = 'positif') AS positif,
        COUNT(*) FILTER (WHERE dampak = 'negatif') AS negatif,
        ROUND(AVG(relevansi_final)::numeric, 2) AS rata_relevansi
      FROM article_scores
      WHERE array_length(klaster_pkpn, 1) > 0
      GROUP BY klaster
      ORDER BY jumlah_artikel DESC
    `)
    res.json({ data: result.rows })
  } catch (err) {
    console.error("[pantau-berita] ringkasan-klaster error:", err)
    res.status(500).json({ error: "gagal memuat ringkasan klaster" })
  }
})

/**
 * GET /api/pantau-berita/tren
 * Tren mingguan: jumlah artikel per hari, rata-rata relevansi, breakdown dampak
 */
router.get("/pantau-berita/tren", requireLogin, async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        DATE(a.terbit_at) AS tanggal,
        COUNT(*) AS total,
        ROUND(AVG(s.relevansi_final)::numeric, 2) AS rata_relevansi,
        COUNT(*) FILTER (WHERE s.dampak = 'positif') AS positif,
        COUNT(*) FILTER (WHERE s.dampak = 'negatif') AS negatif,
        COUNT(*) FILTER (WHERE s.dampak = 'netral') AS netral,
        COUNT(*) FILTER (WHERE s.dampak = 'tidak_ada') AS tidak_ada
      FROM articles a
      JOIN article_scores s ON s.article_id = a.id
      WHERE a.terbit_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(a.terbit_at)
      ORDER BY tanggal
    `)
    res.json({ data: result.rows })
  } catch (err) {
    console.error("[pantau-berita] tren error:", err)
    res.status(500).json({ error: "gagal memuat tren" })
  }
})

/**
 * GET /api/pantau-berita/berita
 * Daftar berita dengan filter: dampak, minRel (0-3), klaster, program, perlu_review, q, sumber, page
 */
router.get("/pantau-berita/berita", requireLogin, async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20))
  const offset = (page - 1) * limit

  const dampak = String(req.query.dampak || "").trim()
  const minRel = Math.max(0, Math.min(3, Number(req.query.minRel) || 0))
  const klaster = String(req.query.klaster || "").trim()
  const perluReview = req.query.perlu_review
  const q = String(req.query.q || "").trim()
  const sumber = String(req.query.sumber || "").trim()

  const conditions: string[] = ["s.id = (SELECT id FROM article_scores s2 WHERE s2.article_id = a.id ORDER BY s2.dibuat_at DESC LIMIT 1)"]
  const params: unknown[] = []
  let paramIdx = 1

  if (dampak) {
    conditions.push(`s.dampak = $${paramIdx++}`)
    params.push(dampak)
  }
  if (minRel > 0) {
    conditions.push(`s.relevansi_final >= $${paramIdx++}`)
    params.push(minRel)
  }
  if (klaster) {
    const klasterNum = Number(klaster)
    if (!isNaN(klasterNum) && klasterNum >= 1 && klasterNum <= 8) {
      conditions.push(`$${paramIdx++} = ANY(s.klaster_pkpn)`)
      params.push(klasterNum)
    }
  }
  if (perluReview === "true") {
    conditions.push("s.perlu_review_manual = true")
  }
  if (q) {
    conditions.push(`a.judul ILIKE $${paramIdx++}`)
    params.push(`%${q}%`)
  }
  if (sumber) {
    conditions.push(`a.sumber = $${paramIdx++}`)
    params.push(sumber)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""

  try {
    const totalResult = await pool.query(
      `SELECT COUNT(*) FROM articles a, LATERAL (SELECT id, relevansi_final, dampak, klaster_pkpn, perlu_review_manual FROM article_scores WHERE article_id = a.id ORDER BY dibuat_at DESC LIMIT 1) s ${where}`,
      params,
    )
    const total = Number(totalResult.rows[0]?.count ?? 0)

    const dataResult = await pool.query(
      `SELECT
         a.id, a.url, a.sumber, a.judul, a.ringkasan, a.terbit_at, a.diambil_at,
         s.relevansi_llm, s.relevansi_final, s.lantai_diterapkan,
         s.dampak, s.sentimen_teks,
         s.klaster_pkpn, s.topik, s.alasan,
         s.keyword_highlight, s.lexicon_score, s.confidence,
         s.perlu_review_manual, s.model, s.prompt_version
       FROM articles a
       JOIN LATERAL (
         SELECT * FROM article_scores WHERE article_id = a.id ORDER BY dibuat_at DESC LIMIT 1
       ) s ON true
       ${where}
       ORDER BY a.terbit_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, limit, offset],
    )

    res.json({
      data: dataResult.rows,
      meta: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
      },
    })
  } catch (err) {
    console.error("[pantau-berita] berita error:", err)
    res.status(500).json({ error: "gagal memuat berita" })
  }
})

/**
 * GET /api/pantau-berita/program
 * Daftar program PKPN (berdasarkan klaster) dengan jumlah artikel terkait
 */
router.get("/pantau-berita/program", requireLogin, async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        unnest(s.klaster_pkpn) AS klaster_id,
        COUNT(*) AS jumlah_artikel,
        ROUND(AVG(s.relevansi_final)::numeric, 2) AS rata_relevansi,
        COUNT(*) FILTER (WHERE s.dampak = 'positif') AS positif,
        COUNT(*) FILTER (WHERE s.dampak = 'negatif') AS negatif,
        MAX(a.terbit_at) AS terakhir_update
      FROM articles a
      JOIN article_scores s ON s.article_id = a.id
      WHERE s.id IN (SELECT DISTINCT ON (article_id) id FROM article_scores ORDER BY article_id, dibuat_at DESC)
        AND array_length(s.klaster_pkpn, 1) > 0
      GROUP BY klaster_id
      ORDER BY klaster_id
    `)
    res.json({ data: result.rows })
  } catch (err) {
    console.error("[pantau-berita] program error:", err)
    res.status(500).json({ error: "gagal memuat program" })
  }
})

/**
 * GET /api/pantau-berita/antrean-review
 * Artikel yang perlu review manual
 */
router.get("/pantau-berita/antrean-review", requireLogin, async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20))
  const offset = (page - 1) * limit

  try {
    const totalResult = await pool.query(
      `SELECT COUNT(*) FROM article_scores WHERE perlu_review_manual = true`,
    )
    const total = Number(totalResult.rows[0]?.count ?? 0)

    const dataResult = await pool.query(
      `SELECT
         a.id, a.url, a.sumber, a.judul, a.ringkasan, a.terbit_at,
         s.relevansi_llm, s.relevansi_final, s.lantai_diterapkan,
         s.dampak, s.sentimen_teks, s.klaster_pkpn, s.topik, s.alasan,
         s.keyword_highlight, s.lexicon_score, s.confidence, s.model, s.status,
         (SELECT COUNT(*) FROM reviews r WHERE r.article_id = a.id) AS jumlah_review
       FROM article_scores s
       JOIN articles a ON a.id = s.article_id
       WHERE s.perlu_review_manual = true
         AND s.id = (SELECT id FROM article_scores s2 WHERE s2.article_id = a.id ORDER BY s2.dibuat_at DESC LIMIT 1)
       ORDER BY s.dibuat_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    )

    res.json({
      data: dataResult.rows,
      meta: { total, page, limit, total_pages: Math.ceil(total / limit) },
    })
  } catch (err) {
    console.error("[pantau-berita] antrean-review error:", err)
    res.status(500).json({ error: "gagal memuat antrean review" })
  }
})

/**
 * POST /api/pantau-berita/review
 * Submit review manual — admin only
 */
router.post("/pantau-berita/review", requireAdmin, async (req, res) => {
  const { article_id, relevansi, dampak, klaster_pkpn, catatan } = req.body

  if (!article_id || typeof article_id !== "number") {
    res.status(400).json({ error: "article_id wajib (number)" })
    return
  }

  const reviewer = req.session?.email ?? "unknown"

  try {
    const result = await pool.query(
      `INSERT INTO reviews (article_id, reviewer, relevansi, dampak, klaster_pkpn, catatan)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        article_id,
        reviewer,
        relevansi != null ? Math.min(3, Math.max(0, relevansi)) : null,
        dampak ?? null,
        Array.isArray(klaster_pkpn) ? klaster_pkpn : null,
        catatan ?? null,
      ],
    )

    // Update status di article_scores
    await pool.query(
      `UPDATE article_scores SET status = 'direview' WHERE article_id = $1`,
      [article_id],
    )

    res.json({ success: true, review: result.rows[0] })
  } catch (err) {
    console.error("[pantau-berita] review error:", err)
    res.status(500).json({ error: "gagal menyimpan review" })
  }
})

/**
 * POST /api/pantau-berita/crawl
 * Crawl RSS feeds dan simpan ke tabel baru (articles + article_scores)
 * Admin only — tapi kita reuse feeds yang sama
 */
router.post("/pantau-berita/crawl", requireAdmin, async (req, res) => {
  const feeds: { sumber: string; url: string }[] = [
    { sumber: "cnbc", url: "https://www.cnbcindonesia.com/rss" },
    { sumber: "katadata", url: "https://katadata.co.id/rss" },
    { sumber: "antara", url: "https://www.antaranews.com/rss/ekonomi" },
    { sumber: "tempo-bisnis", url: "https://rss.tempo.co/bisnis" },
    { sumber: "tempo-nasional", url: "https://rss.tempo.co/nasional" },
    { sumber: "liputan6", url: "https://feed.liputan6.com/rss/bisnis" },
    { sumber: "economist", url: "https://www.economist.com/business/rss.xml" },
    { sumber: "politico", url: "https://www.politico.com/rss/politicopicks.xml" },
  ]

  let newArticles = 0
  let errors = 0
  let skipped = 0

  await Promise.all(
    feeds.map(async (feed) => {
      try {
        const rssResponse = await fetch(feed.url, {
          signal: AbortSignal.timeout(15_000),
        })
        if (!rssResponse.ok) {
          errors++
          return
        }
        const rssText = await rssResponse.text()
        const items = parseRSSItems(rssText, feed.sumber).slice(0, 10)
        if (items.length === 0) {
          errors++
          return
        }

        const batchSize = 5
        for (let i = 0; i < items.length; i += batchSize) {
          const batch = items.slice(i, i + batchSize)
          await Promise.all(
            batch.map(async (item) => {
              try {
                const url_hash = hashContent(item.url)
                const content_hash = hashContent(`${item.judul}\n${item.konten ?? ""}`)

                // Dedup by url_hash
                const dup = await pool.query(
                  "SELECT 1 FROM articles WHERE url_hash = $1",
                  [url_hash],
                )
                if ((dup.rowCount ?? 0) > 0) {
                  skipped++
                  return
                }

                // Dedup by content_hash (konten mirip walau URL beda)
                const dupContent = await pool.query(
                  "SELECT 1 FROM articles WHERE content_hash = $1",
                  [content_hash],
                )
                if ((dupContent.rowCount ?? 0) > 0) {
                  skipped++
                  return
                }

                // Score article
                const score = await scoreArticle(item.judul, item.konten ?? "")

                // Insert article
                const articleResult = await pool.query(
                  `INSERT INTO articles (url, url_hash, content_hash, sumber, judul, isi, ringkasan, bahasa, terbit_at)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, 'id', $8)
                   ON CONFLICT (url) DO NOTHING
                   RETURNING id`,
                  [
                    item.url,
                    url_hash,
                    content_hash,
                    feed.sumber,
                    item.judul,
                    item.konten ?? "",
                    item.konten ? item.konten.slice(0, 300) : "",
                    item.publishedAt ?? new Date(),
                  ],
                )

                if ((articleResult.rowCount ?? 0) === 0) {
                  skipped++
                  return
                }

                const articleId = articleResult.rows[0].id

                // Insert scores
                await pool.query(
                  `INSERT INTO article_scores
                     (article_id, model, prompt_version, relevansi_llm, relevansi_final,
                      lantai_diterapkan, dampak, sentimen_teks, klaster_pkpn, topik, alasan,
                      keyword_highlight, lexicon_score, confidence, perlu_review_manual, status)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'ok')
                   ON CONFLICT (article_id, model, prompt_version) DO NOTHING`,
                  [
                    articleId,
                    score.model,
                    score.prompt_version,
                    score.relevansi_llm,
                    score.relevansi_final,
                    score.lantai_diterapkan,
                    score.dampak,
                    score.sentimen_teks,
                    score.klaster_pkpn,
                    score.topik,
                    score.alasan,
                    JSON.stringify(score.keyword_highlight),
                    score.lexicon_score,
                    score.confidence,
                    score.perlu_review_manual,
                  ],
                )

                newArticles++
              } catch {
                errors++
              }
            }),
          )
        }
      } catch {
        errors++
      }
    }),
  )

  res.json({ success: true, new_articles: newArticles, errors, skipped })
})

export default router