-- 006_chat_feedback.sql — umpan balik pengguna atas jawaban Playground.
--
-- S1 dari rencana 2026-10-31-playground-loop-pertumbuhan.plan.md.
-- Tujuan: mengubah jawaban nyata menjadi bahan bakar perbaikan (S3), sehingga
-- tiap jawaban yang dinilai "tidak membantu" bisa menjadi kasus uji.
--
-- Tanpa PII baru: yang disimpan hanya pertanyaan, jawaban, dan sitasi yang memang
-- sudah dipakai untuk menjawab (tidak menambah data pribadi).
CREATE TABLE IF NOT EXISTS chat_feedback (
  id BIGSERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  pertanyaan TEXT NOT NULL,
  jawaban TEXT NOT NULL,
  sitasi JSONB NOT NULL DEFAULT '[]'::jsonb,
  nilai SMALLINT NOT NULL CHECK (nilai IN (-1, 1)),
  alasan TEXT,
  model TEXT,
  skor_terbaik REAL,
  prompt_variant INT,
  dibuat_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Untuk papan mutu (S4): tren nilai dari waktu ke waktu, dan penambangan kegagalan (S3).
CREATE INDEX IF NOT EXISTS chat_feedback_dibuat_idx ON chat_feedback (dibuat_at DESC);
CREATE INDEX IF NOT EXISTS chat_feedback_nilai_idx ON chat_feedback (nilai, dibuat_at DESC);
