-- Migration: 003 - Early Warning PKPN Clusters
-- Menambahkan kolom deteksi klaster PKPN ke tabel early_warnings

ALTER TABLE early_warnings
  ADD COLUMN IF NOT EXISTS pkpn_clusters INTEGER[] DEFAULT '{}';

ALTER TABLE early_warnings
  ADD COLUMN IF NOT EXISTS pkpn_score INTEGER DEFAULT 0;

ALTER TABLE early_warnings
  ADD COLUMN IF NOT EXISTS pkpn_literal BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_early_warnings_pkpn_score
  ON early_warnings(pkpn_score);

COMMENT ON COLUMN early_warnings.pkpn_clusters IS 'Array klaster PKPN yang terdeteksi (1-8)';
COMMENT ON COLUMN early_warnings.pkpn_score IS 'Skor relevansi PKPN 0-3 (0=tdk relevan, 3=sangat relevan)';
COMMENT ON COLUMN early_warnings.pkpn_literal IS 'True jika teks menyebut "PKPN" secara literal';