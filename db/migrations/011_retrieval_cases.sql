-- Set evaluasi retrieval (tanpa LLM): pertanyaan + dokumen sumber yang benar.
-- Kasus dibangkitkan dari chunk asli korpus, lalu diverifikasi manusia pada sampel.
CREATE TABLE IF NOT EXISTS retrieval_cases (
  id           BIGSERIAL PRIMARY KEY,
  pertanyaan   TEXT NOT NULL,
  jawaban      TEXT NOT NULL,
  dokumen_id   BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_id     BIGINT,
  dibuat_oleh  TEXT NOT NULL DEFAULT 'generator',
  aktif        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pertanyaan)
);

CREATE INDEX IF NOT EXISTS retrieval_cases_aktif_idx ON retrieval_cases (aktif);
