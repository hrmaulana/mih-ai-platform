-- Biaya LLM per pertanyaan: token masuk/keluar + harga per model.
ALTER TABLE usage_logs
  ADD COLUMN IF NOT EXISTS token_in integer,
  ADD COLUMN IF NOT EXISTS token_out integer,
  ADD COLUMN IF NOT EXISTS biaya_usd numeric(12, 6),
  ADD COLUMN IF NOT EXISTS sumber text NOT NULL DEFAULT 'playground';

CREATE TABLE IF NOT EXISTS model_prices (
  model text PRIMARY KEY,
  usd_in_per_1m numeric(12, 6),
  usd_out_per_1m numeric(12, 6),
  catatan text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Harga indikatif (USD per 1 juta token). NULL = belum diketahui (jangan dianggap 0).
INSERT INTO model_prices (model, usd_in_per_1m, usd_out_per_1m, catatan) VALUES
  ('openai/gpt-4o-mini', 0.150000, 0.600000, 'indikatif 2026'),
  ('openai/gpt-4o', 2.500000, 10.000000, 'indikatif 2026'),
  ('deepseek/deepseek-v4-flash', 0.070000, 0.280000, 'indikatif 2026'),
  ('deepseek/deepseek-v4.1-flash-1017', 0.070000, 0.280000, 'indikatif 2026'),
  ('gpt-6-luna', 1.000000, 3.000000, 'indikatif — verifikasi ulang')
ON CONFLICT (model) DO NOTHING;

CREATE INDEX IF NOT EXISTS usage_logs_created_idx ON usage_logs (created_at DESC);
