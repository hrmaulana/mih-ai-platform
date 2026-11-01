-- 007_eval_runs.sql — riwayat evaluasi Playground (S2 loop pertumbuhan).
--
-- Tujuan: mengganti "satu angka sekali ukur" dengan riwayat berjalan, supaya
-- keputusan retrieval/prompt berdiri di atas sebaran antar-run, bukan satu hasil.
CREATE TABLE IF NOT EXISTS eval_runs (
  id BIGSERIAL PRIMARY KEY,
  kapan TIMESTAMPTZ NOT NULL DEFAULT now(),
  model TEXT,
  prompt_variant INT,
  jumlah_kasus INT NOT NULL,
  agregat JSONB NOT NULL,
  catatan TEXT
);

CREATE TABLE IF NOT EXISTS eval_cases (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT NOT NULL REFERENCES eval_runs(id) ON DELETE CASCADE,
  kasus_id TEXT NOT NULL,
  jenis TEXT NOT NULL,
  putusan TEXT NOT NULL,
  peringkat_fakta INT,
  skor_terbaik REAL,
  detik REAL,
  jawaban TEXT,
  UNIQUE (run_id, kasus_id)
);

CREATE INDEX IF NOT EXISTS eval_runs_kapan_idx ON eval_runs (kapan DESC);
CREATE INDEX IF NOT EXISTS eval_cases_run_idx ON eval_cases (run_id);
