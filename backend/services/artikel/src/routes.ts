import { Router } from "express";
import { pool } from "./db";
import { requireAuth } from "./middleware/auth";

const router = Router();

// ---- Healthcheck ----
router.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "artikel" });
});

// ========================================================================
// Early Warning — read-only
// ========================================================================

// ---- GET /api/artikel/early-warning ----
// List early warning articles with filters: sumber, sentimen, alert, q, page
router.get("/api/artikel/early-warning", requireAuth, async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const offset = (page - 1) * limit;
  const sumber = String(req.query.sumber || "").trim();
  const sentimen = String(req.query.sentimen || "").trim();
  const alertFilter = req.query.alert;
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
  if (alertFilter === "true") {
    conditions.push("is_alert = true");
  }
  if (q) {
    conditions.push(`judul ILIKE $${paramIdx++}`);
    params.push(`%${q}%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
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

    const summaryResult = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE alert_level = 'danger') AS danger,
         COUNT(*) FILTER (WHERE alert_level = 'warning') AS warning,
         COUNT(*) AS total_alert
       FROM early_warnings WHERE is_alert = true`,
    );

    const summary = {
      total_alert: Number(summaryResult.rows[0]?.total_alert ?? 0),
      danger: Number(summaryResult.rows[0]?.danger ?? 0),
      warning: Number(summaryResult.rows[0]?.warning ?? 0),
      info: total - Number(summaryResult.rows[0]?.total_alert ?? 0),
    };

    res.json({
      data: dataResult.rows,
      meta: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
        summary,
      },
    });
  } catch (err) {
    console.error("[artikel] early-warning error:", err);
    res.status(500).json({ error: "gagal memuat artikel early warning" });
  }
});

// ---- GET /api/artikel/early-warning/summary ----
// Dashboard summary data
router.get("/api/artikel/early-warning/summary", requireAuth, async (_req, res) => {
  try {
    const alerts = await pool.query(
      `SELECT judul, alert_level, sumber, sentimen_score, fetched_at
       FROM early_warnings
       WHERE is_alert = true
       ORDER BY fetched_at DESC
       LIMIT 5`,
    );

    const trend = await pool.query(
      `SELECT DATE(fetched_at) AS tanggal,
              ROUND(AVG(sentimen_score)::numeric, 3) AS avg_score,
              COUNT(*) AS total
       FROM early_warnings
       WHERE fetched_at >= NOW() - INTERVAL '7 days'
       GROUP BY DATE(fetched_at)
       ORDER BY tanggal`,
    );

    const stats = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE DATE(fetched_at) = CURRENT_DATE) AS total_hari_ini,
         COUNT(*) FILTER (WHERE alert_level = 'danger') AS danger,
         COUNT(*) FILTER (WHERE alert_level = 'warning') AS warning
       FROM early_warnings`,
    );

    const clusterStats = await pool.query(
      `SELECT
         unnest(pkpn_clusters) AS klaster,
         COUNT(*) AS jumlah
       FROM early_warnings
       WHERE pkpn_score > 0 AND array_length(pkpn_clusters, 1) > 0
       GROUP BY klaster
       ORDER BY jumlah DESC
       LIMIT 5`,
    );

    res.json({
      alerts: alerts.rows,
      trend: trend.rows,
      stats: stats.rows[0],
      pkpn_cluster: clusterStats.rows,
    });
  } catch (err) {
    console.error("[artikel] early-warning summary error:", err);
    res.status(500).json({ error: "gagal memuat ringkasan early warning" });
  }
});

// ========================================================================
// Pantau Berita PKPN — read-only
// ========================================================================

// ---- GET /api/artikel/pkpn ----
// List PKPN articles with 3-axis scores (from articles + article_scores)
router.get("/api/artikel/pkpn", requireAuth, async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const dampak = String(req.query.dampak || "").trim();
  const minRel = Math.max(0, Math.min(3, Number(req.query.minRel) || 0));
  const klaster = String(req.query.klaster || "").trim();
  const perluReview = req.query.perlu_review;
  const q = String(req.query.q || "").trim();
  const sumber = String(req.query.sumber || "").trim();

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  // Always filter to latest score per article
  conditions.push("s.id = (SELECT id FROM article_scores s2 WHERE s2.article_id = a.id ORDER BY s2.dibuat_at DESC LIMIT 1)");

  if (dampak) {
    conditions.push(`s.dampak = $${paramIdx++}`);
    params.push(dampak);
  }
  if (minRel > 0) {
    conditions.push(`s.relevansi_final >= $${paramIdx++}`);
    params.push(minRel);
  }
  if (klaster) {
    const klasterNum = Number(klaster);
    if (!isNaN(klasterNum) && klasterNum >= 1 && klasterNum <= 8) {
      conditions.push(`$${paramIdx++} = ANY(s.klaster_pkpn)`);
      params.push(klasterNum);
    }
  }
  if (perluReview === "true") {
    conditions.push("s.perlu_review_manual = true");
  }
  if (q) {
    conditions.push(`a.judul ILIKE $${paramIdx++}`);
    params.push(`%${q}%`);
  }
  if (sumber) {
    conditions.push(`a.sumber = $${paramIdx++}`);
    params.push(sumber);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const totalResult = await pool.query(
      `SELECT COUNT(*) FROM articles a, LATERAL (SELECT id, relevansi_final, dampak, klaster_pkpn, perlu_review_manual FROM article_scores WHERE article_id = a.id ORDER BY dibuat_at DESC LIMIT 1) s ${where}`,
      params,
    );
    const total = Number(totalResult.rows[0]?.count ?? 0);

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
    );

    res.json({
      data: dataResult.rows,
      meta: { total, page, limit, total_pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error("[artikel] pkpn error:", err);
    res.status(500).json({ error: "gagal memuat artikel PKPN" });
  }
});

// ---- GET /api/artikel/klaster ----
// Ringkasan per klaster PKPN
router.get("/api/artikel/klaster", requireAuth, async (_req, res) => {
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
    `);
    res.json({ data: result.rows });
  } catch (err) {
    console.error("[artikel] klaster error:", err);
    res.status(500).json({ error: "gagal memuat ringkasan klaster" });
  }
});

// ---- GET /api/artikel/tren ----
// Weekly trend data
router.get("/api/artikel/tren", requireAuth, async (_req, res) => {
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
    `);
    res.json({ data: result.rows });
  } catch (err) {
    console.error("[artikel] tren error:", err);
    res.status(500).json({ error: "gagal memuat data tren" });
  }
});

export default router;