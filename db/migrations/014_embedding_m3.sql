-- Embedding multibahasa bge-m3 (1024 dim) berdampingan.
-- halfvec dipakai agar HNSW tetap bisa diindeks (batas 2000 dim untuk `vector`).
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS embedding_m3 halfvec(1024);

CREATE INDEX IF NOT EXISTS chunks_embedding_m3_idx
  ON chunks USING hnsw (embedding_m3 halfvec_cosine_ops);
