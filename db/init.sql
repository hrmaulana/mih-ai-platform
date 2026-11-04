-- MVP MIH schema — idempotent. Dijalankan saat container db pertama kali naik.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS documents (
  id             BIGSERIAL PRIMARY KEY,
  filename       TEXT NOT NULL,
  file_type      TEXT NOT NULL,
  file_extension TEXT NOT NULL,
  sha256         TEXT NOT NULL UNIQUE,
  file_path      TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending',
  error_message  TEXT,
  chunk_count    INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chunks (
  id            BIGSERIAL PRIMARY KEY,
  document_id   BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  content       TEXT NOT NULL,
  embedding     vector(1536),
  page_or_slide INT,
  section_title TEXT,
  chunk_index   INT NOT NULL,
  is_outdated   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  unit_kerja    TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_admin      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_tokens (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL DEFAULT 'default',
  token_hash   TEXT NOT NULL UNIQUE,
  scope        TEXT NOT NULL DEFAULT 'internal-read',
  daily_limit  INT NOT NULL DEFAULT 100,
  expires_at   TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS usage_logs (
  id           BIGSERIAL PRIMARY KEY,
  token_id     BIGINT REFERENCES api_tokens(id) ON DELETE CASCADE,
  user_id      BIGINT NOT NULL REFERENCES users(id),
  question     TEXT NOT NULL,
  answer       TEXT NOT NULL,
  cited_chunks JSONB NOT NULL DEFAULT '[]',
  model        TEXT,
  latency_ms   INT,
  token_in     INT,
  token_out    INT,
  biaya_usd    NUMERIC(12,6),
  sumber       TEXT NOT NULL DEFAULT 'playground',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chunks_embedding_idx      ON chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS chunks_document_id_idx    ON chunks (document_id);
CREATE INDEX IF NOT EXISTS chunks_is_outdated_idx    ON chunks (is_outdated);
CREATE INDEX IF NOT EXISTS usage_logs_token_created_idx ON usage_logs (token_id, created_at);

-- Konten publik (berita & publikasi) yang dikelola lewat admin CRUD.
CREATE TABLE IF NOT EXISTS content (
  id            SERIAL PRIMARY KEY,
  type          TEXT NOT NULL CHECK (type IN ('news','publication')),
  slug          TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  excerpt       TEXT NOT NULL DEFAULT '',
  image         TEXT NOT NULL DEFAULT '',
  category      TEXT NOT NULL DEFAULT '',
  author        TEXT NOT NULL DEFAULT '',
  date          TEXT NOT NULL DEFAULT '',
  content       TEXT NOT NULL DEFAULT '',
  document_url  TEXT NOT NULL DEFAULT '',
  document_name TEXT NOT NULL DEFAULT '',
  gallery       TEXT[] NOT NULL DEFAULT '{}',
  is_published  BOOLEAN NOT NULL DEFAULT true,
  created_by    INT REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS content_type_published_idx ON content (type, is_published, date DESC);

CREATE TABLE IF NOT EXISTS conversations (
  id         SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id              SERIAL PRIMARY KEY,
  conversation_id INT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content         TEXT NOT NULL,
  citations       JSONB NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages (conversation_id, created_at);

ALTER TABLE documents ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'upload';
CREATE INDEX IF NOT EXISTS documents_source_idx ON documents (source);

-- ==== 009/010: harga model + metrik harian (setara migrasi) ====
CREATE TABLE IF NOT EXISTS model_prices (
  model text PRIMARY KEY,
  usd_in_per_1m numeric(12, 6),
  usd_out_per_1m numeric(12, 6),
  catatan text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO model_prices (model, usd_in_per_1m, usd_out_per_1m, catatan) VALUES
  ('openai/gpt-4o-mini', 0.150000, 0.600000, 'indikatif 2026'),
  ('openai/gpt-4o', 2.500000, 10.000000, 'indikatif 2026'),
  ('deepseek/deepseek-v4-flash', 0.070000, 0.280000, 'indikatif 2026'),
  ('deepseek/deepseek-v4.1-flash-1017', 0.070000, 0.280000, 'indikatif 2026'),
  ('gpt-6-luna', 1.000000, 3.000000, 'indikatif - verifikasi ulang')
ON CONFLICT (model) DO NOTHING;

CREATE INDEX IF NOT EXISTS usage_logs_created_idx ON usage_logs (created_at DESC);

CREATE TABLE IF NOT EXISTS daily_metrics (
  tanggal date NOT NULL,
  kategori text NOT NULL,
  metrik text NOT NULL,
  dimensi text NOT NULL DEFAULT '',
  nilai numeric NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tanggal, kategori, metrik, dimensi)
);

CREATE INDEX IF NOT EXISTS daily_metrics_kat_idx ON daily_metrics (kategori, tanggal DESC);

CREATE TABLE IF NOT EXISTS access_daily (
  tanggal date NOT NULL,
  jalur text NOT NULL,
  kelas_status text NOT NULL,
  is_bot boolean NOT NULL,
  hits integer NOT NULL DEFAULT 0,
  ip_unik integer NOT NULL DEFAULT 0,
  PRIMARY KEY (tanggal, jalur, kelas_status, is_bot)
);

CREATE INDEX IF NOT EXISTS access_daily_tgl_idx ON access_daily (tanggal DESC);
