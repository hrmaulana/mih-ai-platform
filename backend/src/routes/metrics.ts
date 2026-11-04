import { Router } from "express";
import { pool } from "../db";
import { requireAdmin } from "../middleware/sessionAuth";

/**
 * Metrik harian untuk halaman "Log Harian" (admin).
 * Semua angka berasal dari daily_metrics / access_daily / usage_logs —
 * tidak ada taksiran di sini.
 */
const router = Router();
router.use(requireAdmin);

function batasiTanggal(v: unknown, bawaan: string): string {
  const s = typeof v === "string" ? v.slice(0, 10) : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : bawaan;
}

function hariLalu(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

/** Ringkasan + seri harian + daftar pendek untuk satu rentang. */
router.get("/metrics/daily", async (req, res) => {
  const sampai = batasiTanggal(req.query.sampai, new Date().toISOString().slice(0, 10));
  const dari = batasiTanggal(req.query.dari, hariLalu(29));

  const seri = await pool.query(
    `SELECT tanggal, kategori, metrik, dimensi, nilai
     FROM daily_metrics
     WHERE tanggal BETWEEN $1 AND $2
     ORDER BY tanggal`,
    [dari, sampai],
  );

  const trafik = await pool.query(
    `SELECT tanggal,
            sum(hits) FILTER (WHERE NOT is_bot)::int AS hits_manusia,
            sum(hits) FILTER (WHERE is_bot)::int     AS hits_bot,
            sum(ip_unik) FILTER (WHERE NOT is_bot)::int AS ip_manusia,
            sum(hits) FILTER (WHERE kelas_status = '5xx')::int AS err_5xx
     FROM access_daily
     WHERE tanggal BETWEEN $1 AND $2
     GROUP BY tanggal ORDER BY tanggal`,
    [dari, sampai],
  );

  const jalurAtas = await pool.query(
    `SELECT jalur, sum(hits)::int AS hits, sum(ip_unik)::int AS ip
     FROM access_daily
     WHERE tanggal BETWEEN $1 AND $2 AND NOT is_bot
     GROUP BY jalur ORDER BY hits DESC LIMIT 10`,
    [dari, sampai],
  );

  const pertanyaanGagal = await pool.query(
    `SELECT id, question, model, latency_ms, created_at
     FROM usage_logs
     WHERE created_at::date BETWEEN $1 AND $2
       AND (answer LIKE 'Saya tidak menemukan%' OR jsonb_array_length(cited_chunks) = 0)
     ORDER BY created_at DESC LIMIT 10`,
    [dari, sampai],
  );

  const pertanyaanTeratas = await pool.query(
    `SELECT question, count(*)::int AS n
     FROM usage_logs
     WHERE created_at::date BETWEEN $1 AND $2
     GROUP BY question ORDER BY n DESC, question LIMIT 10`,
    [dari, sampai],
  );

  const model = await pool.query(
    `SELECT model, count(*)::int AS n,
            coalesce(sum(biaya_usd),0) AS biaya_usd,
            coalesce(sum(token_in),0)::bigint AS token_in,
            coalesce(sum(token_out),0)::bigint AS token_out
     FROM usage_logs
     WHERE created_at::date BETWEEN $1 AND $2 AND model IS NOT NULL
     GROUP BY model ORDER BY n DESC`,
    [dari, sampai],
  );

  res.json({
    rentang: { dari, sampai },
    seri: seri.rows,
    trafik: trafik.rows,
    jalur_atas: jalurAtas.rows,
    pertanyaan_gagal: pertanyaanGagal.rows,
    pertanyaan_teratas: pertanyaanTeratas.rows,
    model: model.rows,
  });
});

/** Daftar pertanyaan satu hari (untuk ditelusuri). */
router.get("/metrics/questions", async (req, res) => {
  const tanggal = batasiTanggal(req.query.tanggal, new Date().toISOString().slice(0, 10));
  const r = await pool.query(
    `SELECT u.id, u.question, u.answer, u.model, u.latency_ms, u.token_in, u.token_out,
            u.biaya_usd, u.created_at, u.user_id,
            jsonb_array_length(u.cited_chunks) AS sitasi,
            (SELECT count(*)::int FROM chat_feedback f WHERE f.pertanyaan = u.question) AS feedback
     FROM usage_logs u
     WHERE u.created_at::date = $1
     ORDER BY u.created_at DESC
     LIMIT 200`,
    [tanggal],
  );
  res.json({ tanggal, baris: r.rows });
});

export default router;
