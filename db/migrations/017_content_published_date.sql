-- 017_content_published_date.sql
-- Tanggal terbit sebagai kolom DATE tersendiri.
--
-- Latar belakang: kolom `date` bertipe TEXT berisi format campur ("8 Agustus 2026"
-- dari data awal, "2026-11-12" dari CMS) sehingga `ORDER BY date DESC` mengurutkan
-- secara leksikografis (angka hari lebih dulu) — urutan berita/publikasi jadi salah.
--
-- `created_at` TIDAK diubah: tetap menandai kapan baris dibuat. Kolom `date` lama
-- juga dibiarkan utuh (dipakai sebagai fallback tampilan bila perlu), sedangkan
-- urutan & tampilan beralih ke `published_date`.

ALTER TABLE content ADD COLUMN IF NOT EXISTS published_date DATE;

-- Isi dari kolom `date`: dukung format Indonesia ("8 Agustus 2026") dan ISO
-- ("2026-11-12"). Nama bulan Indonesia dipetakan manual karena to_date()
-- memakai nama bulan Inggris.
UPDATE content AS c
   SET published_date = p.tgl
  FROM (
    SELECT id,
           CASE
             WHEN date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN left(date, 10)::date
             WHEN date ~ '^[0-9]{1,2}\s+[A-Za-z]+\s+[0-9]{4}$' THEN
               make_date(
                 split_part(date, ' ', 3)::int,
                 CASE split_part(date, ' ', 2)
                   WHEN 'Januari'   THEN 1  WHEN 'Februari'  THEN 2
                   WHEN 'Maret'     THEN 3  WHEN 'April'     THEN 4
                   WHEN 'Mei'       THEN 5  WHEN 'Juni'      THEN 6
                   WHEN 'Juli'      THEN 7  WHEN 'Agustus'   THEN 8
                   WHEN 'September' THEN 9  WHEN 'Oktober'   THEN 10
                   WHEN 'November'  THEN 11 WHEN 'Desember'  THEN 12
                 END,
                 split_part(date, ' ', 1)::int
               )
             ELSE NULL
           END AS tgl
      FROM content
  ) AS p
 WHERE c.id = p.id
   AND p.tgl IS NOT NULL
   AND c.published_date IS DISTINCT FROM p.tgl;

-- Baris tanpa tanggal terbit yang bisa dibaca → pakai tanggal pembuatan baris
-- (agar tidak ada berita yang "hilang" dari urutan).
UPDATE content
   SET published_date = created_at::date
 WHERE published_date IS NULL;

CREATE INDEX IF NOT EXISTS content_published_idx
  ON content (type, is_published, published_date DESC);

COMMENT ON COLUMN content.published_date IS
  'Tanggal terbit berita/publikasi (DATE). Sumber urutan & tampilan. created_at tetap waktu pembuatan baris.';
