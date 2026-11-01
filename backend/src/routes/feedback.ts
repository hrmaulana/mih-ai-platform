import { Router } from "express";
import { pool } from "../db";
import { askAuth } from "../middleware/tokenAuth";

// Umpan balik atas jawaban Playground (S1 loop pertumbuhan).
// Aturan muatan dijaga di sini supaya tabel tetap bersih dan bisa ditambang (S3):
// nilai hanya 1/-1, alasan dibatasi 500 karakter, dan kolom wajib tidak boleh kosong.
const router = Router();

router.post("/feedback", askAuth, async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const pertanyaan = typeof b.pertanyaan === "string" ? b.pertanyaan.trim() : "";
  const jawaban = typeof b.jawaban === "string" ? b.jawaban.trim() : "";
  const nilai = Number(b.nilai);
  const alasan = typeof b.alasan === "string" ? b.alasan.trim() : null;

  if (pertanyaan.length < 3) return res.status(400).json({ error: "pertanyaan wajib diisi" });
  if (jawaban.length < 1) return res.status(400).json({ error: "jawaban wajib diisi" });
  if (nilai !== 1 && nilai !== -1) return res.status(400).json({ error: "nilai harus 1 (membantu) atau -1 (tidak membantu)" });
  if (alasan !== null && alasan.length > 500) return res.status(400).json({ error: "alasan maksimal 500 karakter" });

  const userId = (req as unknown as { user?: { userId?: number } }).user?.userId ?? null;

  try {
    const { rows } = await pool.query(
      `INSERT INTO chat_feedback (user_id, pertanyaan, jawaban, sitasi, nilai, alasan, model, skor_terbaik, prompt_variant)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        userId,
        pertanyaan,
        jawaban,
        JSON.stringify(Array.isArray(b.sitasi) ? b.sitasi : []),
        nilai === 1 ? 1 : -1,
        alasan,
        typeof b.model === "string" ? b.model : null,
        b.skorTerbaik === null || b.skorTerbaik === undefined ? null : Number(b.skorTerbaik),
        b.promptVariant === null || b.promptVariant === undefined ? null : Number(b.promptVariant),
      ],
    );
    res.status(201).json({ ok: true, id: rows[0].id });
  } catch (e) {
    console.error("feedback_gagal", e);
    res.status(500).json({ error: "gagal menyimpan umpan balik" });
  }
});

export default router;
