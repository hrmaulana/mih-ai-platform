-- Migration: 004 - Pantau Berita PKPN
-- Skema baru untuk pipeline scoring 3-axis (relevansi/dampak/sentimen_teks)
-- Tidak mengubah tabel early_warnings yang sudah ada.

CREATE TABLE IF NOT EXISTS articles (
  id          BIGSERIAL PRIMARY KEY,
  url         TEXT NOT NULL UNIQUE,
  url_hash    TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  sumber      TEXT NOT NULL,
  judul       TEXT NOT NULL,
  isi         TEXT NOT NULL,
  ringkasan   TEXT,
  bahasa      TEXT DEFAULT 'id',
  terbit_at   TIMESTAMPTZ NOT NULL,
  diambil_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_articles_terbit_at ON articles (terbit_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_content_hash ON articles (content_hash);

CREATE TABLE IF NOT EXISTS article_scores (
  id                BIGSERIAL PRIMARY KEY,
  article_id        BIGINT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  model             TEXT NOT NULL,
  prompt_version    TEXT NOT NULL DEFAULT 'v1',
  relevansi_llm     SMALLINT NOT NULL CHECK (relevansi_llm BETWEEN 0 AND 3),
  relevansi_final   SMALLINT NOT NULL CHECK (relevansi_final BETWEEN 0 AND 3),
  lantai_diterapkan BOOLEAN NOT NULL DEFAULT false,
  dampak            TEXT NOT NULL CHECK (dampak IN ('positif','negatif','netral','tidak_ada')),
  sentimen_teks     TEXT NOT NULL CHECK (sentimen_teks IN ('positif','negatif','netral')),
  klaster_pkpn      SMALLINT[] NOT NULL DEFAULT '{}',
  topik             TEXT,
  alasan            TEXT,
  keyword_highlight JSONB NOT NULL DEFAULT '[]',
  lexicon_score     REAL,
  confidence        REAL,
  perlu_review_manual BOOLEAN NOT NULL DEFAULT false,
  status            TEXT NOT NULL DEFAULT 'ok',
  dibuat_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (article_id, model, prompt_version)
);

CREATE INDEX IF NOT EXISTS idx_article_scores_klaster ON article_scores USING GIN (klaster_pkpn);
CREATE INDEX IF NOT EXISTS idx_article_scores_perlu_review
  ON article_scores (perlu_review_manual) WHERE perlu_review_manual;

CREATE TABLE IF NOT EXISTS reviews (
  id         BIGSERIAL PRIMARY KEY,
  article_id BIGINT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  reviewer   TEXT NOT NULL,
  relevansi  SMALLINT CHECK (relevansi BETWEEN 0 AND 3),
  dampak     TEXT CHECK (dampak IN ('positif','negatif','netral','tidak_ada')),
  klaster_pkpn SMALLINT[],
  catatan    TEXT,
  dibuat_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE articles IS 'Artikel berita hasil crawl untuk Pantau Berita PKPN';
COMMENT ON TABLE article_scores IS 'Skor 3-axis (relevansi, dampak, sentimen_teks) per artikel per model';
COMMENT ON TABLE reviews IS 'Review manual dari reviewer terhadap skor artikel';
COMMENT ON COLUMN articles.url_hash IS 'SHA256 hash dari URL untuk dedup cepat';
COMMENT ON COLUMN articles.content_hash IS 'SHA256 hash dari konten untuk deteksi duplikat konten';
COMMENT ON COLUMN article_scores.relevansi_llm IS 'Skor relevansi dari LLM (0-3)';
COMMENT ON COLUMN article_scores.relevansi_final IS 'Skor relevansi final setelah applyFloor (0-3)';
COMMENT ON COLUMN article_scores.lantai_diterapkan IS 'True jika relevansi_final > relevansi_llm karena floor';
COMMENT ON COLUMN article_scores.dampak IS 'Dampak terhadap program PKPN';
COMMENT ON COLUMN article_scores.sentimen_teks IS 'Sentimen teks berita';
COMMENT ON COLUMN article_scores.klaster_pkpn IS 'Array klaster PKPN terkait (1-8)';
COMMENT ON COLUMN article_scores.perlu_review_manual IS 'Flag untuk artikel yang perlu review manual';