import { Router } from "express"
import { pool } from "../db"
import { requireLogin, requireAdmin } from "../middleware/sessionAuth"
import { calculateLexiconScore } from "../lib/lexicon"
import { analyzeSentimentLLM } from "../lib/llm-sentiment"

const router = Router()

// ---- GET /api/early-warning ----
// List artikel dengan filter: sumber, sentimen, search, pagination
router.get("/early-warning", requireLogin, async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20))
  const offset = (page - 1) * limit
  const sumber = String(req.query.sumber || "").trim()
  const sentimen = String(req.query.sentimen || "").trim()
  const alertFilter = req.query.alert
  const q = String(req.query.q || "").trim()

  const conditions: string[] = []
  const params: unknown[] = []
  let paramIdx = 1

  if (sumber) {
    conditions.push(`sumber = $${paramIdx++}`)
    params.push(sumber)
  }
  if (sentimen) {
    conditions.push(`sentimen = $${paramIdx++}`)
    params.push(sentimen)
  }
  if (alertFilter === "true") {
    conditions.push("is_alert = TRUE")
  }
  if (q) {
    conditions.push(`judul ILIKE $${paramIdx++}`)
    params.push(`%${q}%`)
  }

  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : ""

  // Count total
  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM early_warnings ${where}`,
    params,
  )
  const total = countResult.rows[0].total

  // Fetch data
  const dataResult = await pool.query(
    `SELECT id, judul, sumber, url, published_at, sentimen,
            sentimen_score, confidence, ringkasan, alert_level, is_alert,
            created_at
       FROM early_warnings ${where}
      ORDER BY published_at DESC NULLS LAST, created_at DESC
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    [...params, limit, offset],
  )

  // Summary
  const summaryResult = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE is_alert = TRUE)::int AS total_alert,
       COUNT(*) FILTER (WHERE alert_level = 'danger')::int AS danger,
       COUNT(*) FILTER (WHERE alert_level = 'warning')::int AS warning,
       COUNT(*)::int AS info
       FROM early_warnings`,
  )

  res.json({
    data: dataResult.rows,
    meta: {
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
      summary: summaryResult.rows[0],
    },
  })
})

// ---- GET /api/early-warning/summary ----
// Data untuk widget dashboard: alerts + trend + stats
router.get("/early-warning/summary", requireLogin, async (_req, res) => {
  // 5 alert terbaru
  const alertsResult = await pool.query(
    `SELECT id, judul, sumber, url, sentimen, sentimen_score,
            alert_level, is_alert, published_at, created_at
       FROM early_warnings
      WHERE is_alert = TRUE
      ORDER BY created_at DESC
      LIMIT 5`,
  )

  // Trend sentimen 7 hari
  const trendResult = await pool.query(
    `SELECT DATE(fetched_at) AS tanggal,
            ROUND(AVG(sentimen_score)::numeric, 3)::float AS avg_score,
            COUNT(*)::int AS total
       FROM early_warnings
      WHERE fetched_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(fetched_at)
      ORDER BY tanggal`,
  )

  // Stats hari ini
  const statsResult = await pool.query(
    `SELECT
       COUNT(*)::int AS total_hari_ini,
       COUNT(*) FILTER (WHERE alert_level = 'danger')::int AS danger,
       COUNT(*) FILTER (WHERE alert_level = 'warning')::int AS warning
       FROM early_warnings
      WHERE DATE(fetched_at) = CURRENT_DATE`,
  )

  res.json({
    alerts: alertsResult.rows,
    trend: trendResult.rows,
    stats: statsResult.rows[0] ?? { total_hari_ini: 0, danger: 0, warning: 0 },
  })
})

// ---- POST /api/early-warning/crawl ----
// Trigger crawler manual — admin only
router.post("/early-warning/crawl", requireAdmin, async (req, res) => {
  // Daftar RSS feed
  const feeds: { sumber: string; url: string }[] = [
    { sumber: "cnbc", url: "https://www.cnbcindonesia.com/rss" },
    { sumber: "katadata", url: "https://katadata.co.id/rss" },
    { sumber: "antara", url: "https://www.antaranews.com/rss/ekonomi" },
    { sumber: "tempo-bisnis", url: "https://rss.tempo.co/bisnis" },
    { sumber: "tempo-nasional", url: "https://rss.tempo.co/nasional" },
    { sumber: "liputan6", url: "https://feed.liputan6.com/rss/bisnis" },
  ]

  let newArticles = 0
  let errors = 0

  for (const feed of feeds) {
    try {
      const rssResponse = await fetch(feed.url, {
        signal: AbortSignal.timeout(15_000),
      })
      if (!rssResponse.ok) {
        errors++
        continue
      }
      const rssText = await rssResponse.text()

      // Parse RSS XML sederhana (tanpa dependency berat)
      const items = parseRSSItems(rssText, feed.sumber)
      if (items.length === 0) {
        errors++
        continue
      }

      for (const item of items) {
        try {
          // Cek duplicate URL
          const dup = await pool.query(
            "SELECT 1 FROM early_warnings WHERE url = $1",
            [item.url],
          )
          if ((dup.rowCount ?? 0) > 0) continue

          // Lexicon scoring
          const lexResult = calculateLexiconScore(item.judul, item.konten)

          // LLM analysis hanya jika borderline
          let finalScore = lexResult.score
          let confidence = "high"
          let llmScore: number | null = null
          let keyword = ""
          let ringkasan = ""

          if (Math.abs(lexResult.score) < 0.3) {
            const llmResult = await analyzeSentimentLLM(item.judul, item.konten)
            llmScore = llmResult.score
            finalScore = (lexResult.score + llmResult.score) / 2
            confidence = "medium"
            keyword = llmResult.keyword
            ringkasan = llmResult.ringkasan
          }

          // Tentukan sentimen
          const sentimen =
            finalScore > 0.1
              ? "positif"
              : finalScore < -0.1
                ? "negatif"
                : "netral"

          // Tentukan alert level dari rules di §4.4
          const alertResult = determineAlert(finalScore, confidence)
          const isAlert = alertResult !== "info"

          // Generate keyword dari lexicon jika LLM tidak dipanggil
          if (!keyword) {
            const allDetails = [
              ...lexResult.details.positive,
              ...lexResult.details.negative,
            ]
            keyword = allDetails.slice(0, 3).join(", ")
          }

          // Generate ringkasan dari judul jika LLM tidak menghasilkan
          if (!ringkasan) {
            ringkasan = item.konten
              ? item.konten.slice(0, 150) + (item.konten.length > 150 ? "..." : "")
              : item.judul
          }

          await pool.query(
            `INSERT INTO early_warnings
               (judul, sumber, url, konten, published_at, keyword,
                sentimen, sentimen_score, confidence, ringkasan,
                lex_score, llm_score, is_alert, alert_level)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
             ON CONFLICT (url) DO NOTHING`,
            [
              item.judul,
              feed.sumber,
              item.url,
              item.konten ?? "",
              item.publishedAt,
              keyword,
              sentimen,
              finalScore,
              confidence,
              ringkasan,
              lexResult.score,
              llmScore,
              isAlert,
              alertResult,
            ],
          )
          newArticles++
        } catch {
          errors++
        }
      }
    } catch {
      errors++
    }
  }

  res.json({ success: true, new_articles: newArticles, errors })
})

// ---- Helpers ----

/**
 * Parse RSS XML sederhana — extract item elements
 */
function parseRSSItems(
  xml: string,
  sumber: string,
): { judul: string; url: string; konten: string; publishedAt: Date | null }[] {
  const items: { judul: string; url: string; konten: string; publishedAt: Date | null }[] = []

  // Regex sederhana untuk extract <item> blocks
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

  return items
}

/**
 * Extract content of an XML tag (first occurrence)
 */
function extractTag(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i")
  const m = regex.exec(xml)
  if (!m) return null

  // Decode HTML entities sederhana
  return m[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

/**
 * Tentukan alert level berdasarkan score dan confidence (§4.4)
 */
function determineAlert(score: number, confidence: string): string {
  if (confidence === "high" && score < -0.5) return "danger"
  if (confidence === "high" && score < -0.3) return "warning"
  if (confidence === "medium" && score < -0.3) return "warning"
  if (confidence === "medium" && score < -0.5) return "warning"
  return "info"
}

export default router