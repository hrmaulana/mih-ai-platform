-- Migration: 002 - Early Warning System
-- Membuat tabel early_warnings untuk menyimpan hasil crawling sentimen berita

CREATE TABLE IF NOT EXISTS early_warnings (
    id SERIAL PRIMARY KEY,
    judul VARCHAR(500) NOT NULL,
    sumber VARCHAR(100) NOT NULL,          -- cnbc | katadata | antara | tempo-bisnis | tempo-nasional | liputan6
    url TEXT NOT NULL UNIQUE,
    konten TEXT,
    published_at TIMESTAMP,
    fetched_at TIMESTAMP DEFAULT NOW(),
    keyword VARCHAR(100),                  -- topik terdeteksi (e.g., "inflasi", "APBN")
    sentimen VARCHAR(20) DEFAULT 'netral', -- positif | negatif | netral
    sentimen_score DECIMAL(4,3),           -- -1.000 s.d +1.000
    confidence VARCHAR(10) DEFAULT 'high', -- high | medium | low
    ringkasan TEXT,                        -- AI-generated (1-2 kalimat)
    lex_score DECIMAL(4,3),                -- raw score dari lexicon (untuk audit)
    llm_score DECIMAL(4,3),               -- score dari LLM (null jika tidak dipanggil)
    is_alert BOOLEAN DEFAULT FALSE,
    alert_level VARCHAR(10) DEFAULT 'info', -- info | warning | danger
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_early_warnings_sentimen ON early_warnings(sentimen);
CREATE INDEX IF NOT EXISTS idx_early_warnings_alert ON early_warnings(is_alert);
CREATE INDEX IF NOT EXISTS idx_early_warnings_fetched ON early_warnings(fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_early_warnings_sumber ON early_warnings(sumber);
