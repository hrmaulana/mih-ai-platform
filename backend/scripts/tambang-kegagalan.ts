import { pool } from "../src/db";

// S3: ubah jawaban yang dinilai "tidak membantu" menjadi KANDIDAT kasus uji.
// Sengaja tidak otomatis menjadi kasus uji: manusia yang memutuskan (status 'diterima'),
// karena tidak semua keluhan pengguna berarti jawaban salah (bisa juga pertanyaan ambigu).
async function main() {
  const { rows } = await pool.query(
    `SELECT f.id, f.pertanyaan, f.jawaban, f.alasan
       FROM chat_feedback f
       LEFT JOIN kasus_kandidat k ON k.feedback_id = f.id
      WHERE f.nilai = -1 AND k.id IS NULL
      ORDER BY f.dibuat_at
      LIMIT 200`,
  );
  let baru = 0;
  for (const r of rows) {
    await pool.query(
      `INSERT INTO kasus_kandidat (feedback_id, pertanyaan, jawaban_dinilai, alasan)
       VALUES ($1, $2, $3, $4) ON CONFLICT (feedback_id) DO NOTHING`,
      [r.id, r.pertanyaan, String(r.jawaban).slice(0, 4000), r.alasan],
    );
    baru++;
  }
  const semua = await pool.query(`SELECT count(*)::int AS n FROM kasus_kandidat WHERE status = 'kandidat'`);
  console.log(`kandidat baru: ${baru} | menunggu keputusan manusia: ${semua.rows[0].n}`);
  await pool.end();
}

main().catch((e) => {
  console.error("tambang_gagal", e);
  process.exit(1);
});
