-- Pilot embedding besar (3072 dim) berdampingan dengan yang lama (1536 dim).
-- halfvec dipakai karena HNSW pgvector dibatasi 2000 dim untuk `vector`,
-- sedangkan halfvec mendukung sampai 4000 dim.
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE chunks ADD COLUMN IF NOT EXISTS embedding_large halfvec(3072);

CREATE INDEX IF NOT EXISTS chunks_embedding_large_idx
  ON chunks USING hnsw (embedding_large halfvec_cosine_ops);
