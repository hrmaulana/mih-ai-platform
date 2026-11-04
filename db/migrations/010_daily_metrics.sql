-- Agregat harian untuk halaman Log Harian. Bentuk narrow: metrik baru
-- tidak memerlukan migrasi baru.
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

-- Trafik dari nginx (JSON log). IP tidak disimpan mentah — hanya hitungan unik.
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
