import { Router } from "express";
import { pool } from "./db";
import { requireAuth, requireAdmin } from "./middleware/auth";
import { parseRSSItems } from "./lib/rss";
import { calculateLexiconScore } from "./lib/lexicon";
import { analyzeSentimentLLM } from "./lib/llm-sentiment";
import { detectClusters, relevanceFloor } from "./lib/highlight";

const router = Router();

// ---- Feed list ----
const FEEDS: { sumber: string; url: string }[] = [
  { sumber: "cnbc", url: "https://www.cnbcindonesia.com/rss" },
  { sumber: "katadata", url: "https://katadata.co.id/rss" },
  { sumber: "antara", url: "https://www.antaranews.com/rss/ekonomi" },
  { sumber: "tempo-bisnis", url: "https://rss.tempo.co/bisnis" },
  { sumber: "tempo-nasional", url: "https://rss.tempo.co/nasional" },
  { sumber: "liputan6", url: "https://feed.liputan6.com/rss/bisnis" },
  { sumber: "economist", url: "https://www.economist.com/business/rss.xml" },
  { sumber: "politico", url: "https://www.politico.com/rss/politicopicks.xml" },
];

// ---- POST /crawl ----
// Trigger crawl RSS feeds — authenticated (admin only)
router.post("/crawl", requireAdmin, async (req, res) => {
  let newArticles = 0;
  let errors = 0;

  await Promise.all(
    FEEDS.map(async (feed) => {
      try {
        const rssResponse = await fetch(feed.url, {
          signal: AbortSignal.timeout(15_000),
        });
        if (!rssResponse.ok) {
          errors++;
          return;
        }
        const rssText = await rssResponse.text();
        const items = parseRSSItems(rssText).slice(0, 10);
        if (items.length === 0) {
          errors++;
          return;
        }

        const batchSize = 5;
        for (let i = 0; i < items.length; i += batchSize) {
          const batch = items.slice(i, i + batchSize);
          await Promise.all(
            batch.map(async (item) => {
              try {
                const dup = await pool.query(
                  "SELECT 1 FROM early_warnings WHERE url = $1",
                  [item.url],
                );
                if ((dup.rowCount ?? 0) > 0) return;

                const lexResult = calculateLexiconScore(item.judul, item.konten);

                let finalScore = lexResult.score;
                let confidence = "high";
                let llmScore: number | null = null;
                let keyword = "";
                let ringkasan = "";

                if (Math.abs(lexResult.score) < 0.3) {
                  const llmResult = await analyzeSentimentLLM(item.judul, item.konten);
                  llmScore = llmResult.score;
                  finalScore = (lexResult.score + llmResult.score) / 2;
                  confidence = "medium";
                  keyword = llmResult.keyword;
                  ringkasan = llmResult.ringkasan;
                }

                const sentimen =
                  finalScore > 0.1
                    ? "positif"
                    : finalScore < -0.1
                      ? "negatif"
                      : "netral";

                const alertResult = determineAlert(finalScore, confidence);
                const isAlert = alertResult !== "info";

                if (!keyword) {
                  const allDetails = [
                    ...lexResult.details.positive,
                    ...lexResult.details.negative,
                  ];
                  keyword = allDetails.slice(0, 3).join(", ");
                }

                if (!ringkasan) {
                  ringkasan = item.konten
                    ? item.konten.slice(0, 150) + (item.konten.length > 150 ? "..." : "")
                    : item.judul;
                }

                // PKPN detection
                const pkpnText = `${item.judul}\n${item.konten ?? ""}`;
                const pkpnDetect = detectClusters(pkpnText);
                const pkpnScore = relevanceFloor(pkpnText);

                await pool.query(
                  `INSERT INTO early_warnings
                     (judul, sumber, url, konten, published_at, keyword,
                      sentimen, sentimen_score, confidence, ringkasan,
                      lex_score, llm_score, is_alert, alert_level,
                      pkpn_clusters, pkpn_score, pkpn_literal)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
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
                    pkpnDetect.klaster,
                    pkpnScore,
                    pkpnDetect.literalPKPN,
                  ],
                );
                newArticles++;
              } catch {
                errors++;
              }
            }),
          );
        }
      } catch {
        errors++;
      }
    }),
  );

  res.json({ success: true, new_articles: newArticles, errors });
});

// ---- GET /articles ----
// Get articles list — authenticated
router.get("/articles", requireAuth, async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const offset = (page - 1) * limit;
  const sumber = String(req.query.sumber || "").trim();
  const sentimen = String(req.query.sentimen || "").trim();
  const q = String(req.query.q || "").trim();

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (sumber) {
    conditions.push(`sumber = $${paramIdx++}`);
    params.push(sumber);
  }
  if (sentimen) {
    conditions.push(`sentimen = $${paramIdx++}`);
    params.push(sentimen);
  }
  if (q) {
    conditions.push(`judul ILIKE $${paramIdx++}`);
    params.push(`%${q}%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const totalResult = await pool.query(
    `SELECT COUNT(*) FROM early_warnings ${where}`,
    params,
  );
  const total = Number(totalResult.rows[0]?.count ?? 0);

  const dataResult = await pool.query(
    `SELECT * FROM early_warnings ${where}
     ORDER BY fetched_at DESC
     LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    [...params, limit, offset],
  );

  res.json({
    data: dataResult.rows,
    meta: { total, page, limit, total_pages: Math.ceil(total / limit) },
  });
});

// ---- GET /health ----
router.get("/health", (_req, res) => {
  res.json({ ok: true, service: "crawler" });
});

// ---- Helpers ----
function determineAlert(score: number, confidence: string): string {
  if (confidence === "high" && score < -0.5) return "danger";
  if (confidence === "high" && score < -0.3) return "warning";
  if (confidence === "medium" && score < -0.3) return "warning";
  if (confidence === "medium" && score < -0.5) return "warning";
  return "info";
}

export default router;