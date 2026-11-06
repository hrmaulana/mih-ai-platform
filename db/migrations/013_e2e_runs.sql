-- Hasil harness end-to-end (kasus dari korpus, jawaban dinilai terhadap fakta verbatim).
CREATE TABLE IF NOT EXISTS e2e_runs (
  id bigserial PRIMARY KEY,
  kapan timestamptz NOT NULL DEFAULT now(),
  jumlah_kasus integer NOT NULL,
  konfigurasi jsonb NOT NULL DEFAULT '{}'::jsonb,
  agregat jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS e2e_runs_kapan_idx ON e2e_runs (kapan DESC);
