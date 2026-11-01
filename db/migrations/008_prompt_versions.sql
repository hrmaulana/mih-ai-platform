-- 008_prompt_versions.sql — audit versi prompt + kandidat kasus uji (S3 loop pertumbuhan).
--
-- Dua alasan tabel ini ada:
--  1. Setiap perubahan perilaku prompt harus tercatat siapa yang menyetujui dan kapan
--     (audit), bukan sekadar ditimpa di kode.
--  2. Jawaban yang dinilai "tidak membantu" dikumpulkan lebih dulu sebagai KANDIDAT,
--     lalu manusia memutuskan mana yang layak menjadi kasus uji (status).
CREATE TABLE IF NOT EXISTS prompt_versions (
  id BIGSERIAL PRIMARY KEY,
  variant INT NOT NULL,
  catatan TEXT NOT NULL,
  isi TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draf' CHECK (status IN ('draf', 'disetujui', 'ditolak')),
  diusulkan_oleh TEXT,
  disetujui_oleh TEXT,
  disetujui_at TIMESTAMPTZ,
  dibuat_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kasus_kandidat (
  id BIGSERIAL PRIMARY KEY,
  feedback_id BIGINT REFERENCES chat_feedback(id) ON DELETE CASCADE,
  pertanyaan TEXT NOT NULL,
  jawaban_dinilai TEXT NOT NULL,
  alasan TEXT,
  status TEXT NOT NULL DEFAULT 'kandidat' CHECK (status IN ('kandidat', 'diterima', 'ditolak')),
  dibuat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (feedback_id)
);

CREATE INDEX IF NOT EXISTS kasus_kandidat_status_idx ON kasus_kandidat (status, dibuat_at DESC);
