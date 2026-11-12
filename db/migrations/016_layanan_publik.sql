-- 015_layanan_publik.sql
-- Menu Layanan Publik: konten 6 bagian dikelola dari CMS admin.
-- Struktur generik: tiap baris punya `jenis` + `payload` (JSONB) agar
-- satu tabel menampung enam bentuk konten tanpa migrasi berulang.
--
-- Seed awal: 8 layanan utama (deskripsi dari portal.ts) + 3 layanan lainnya
-- + baris tunggal teknis & survey. Field yang belum ada datanya dibiarkan
-- kosong agar diisi lewat CMS (bukan dikarang di sini).

CREATE TABLE IF NOT EXISTS layanan_publik (
  id           SERIAL PRIMARY KEY,
  jenis        TEXT NOT NULL CHECK (jenis IN
                 ('dasar_hukum','jenis_layanan','teknis','survey','layanan_lainnya','dokumentasi')),
  slug         TEXT NOT NULL UNIQUE,
  judul        TEXT NOT NULL,
  urutan       INT NOT NULL DEFAULT 0,
  akses        TEXT NOT NULL DEFAULT 'publik' CHECK (akses IN ('publik','login')),
  is_published BOOLEAN NOT NULL DEFAULT true,
  payload      JSONB NOT NULL DEFAULT '{}',
  created_by   INT REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS layanan_publik_jenis_idx ON layanan_publik (jenis, urutan);

INSERT INTO layanan_publik (jenis, slug, judul, urutan, akses, payload) VALUES
  ('jenis_layanan', 'pelayanan-pendampingan-pengalokasian-anggaran-bagi-kementerian-lembaga', 'Pelayanan Pendampingan Pengalokasian Anggaran bagi Kementerian/Lembaga', 1, 'publik', $j${"deskripsi": "Diberikan kepada Kementerian/Lembaga (K/L) dalam menyusun perencanaan dan pengalokasian anggaran.", "ruang_lingkup": [], "unit_pengampu": [], "lampiran": []}$j$::jsonb),
  ('jenis_layanan', 'konsultasi-arah-kebijakan-nasional-bagi-sektor-di-daerah', 'Konsultasi Arah Kebijakan Nasional bagi Sektor di Daerah', 2, 'publik', $j${"deskripsi": "Diberikan kepada Pemerintah Daerah/Masyarakat umum/Mahasiswa/Lembaga Non-Pemerintah/Organisasi Masyarakat dalam penyusunan perencanaan Pembangunan daerah agar dapat selaras dengan kebijakan nasional.", "ruang_lingkup": [], "unit_pengampu": [], "lampiran": []}$j$::jsonb),
  ('jenis_layanan', 'konsultasi-dokumen-perencanaan-nasional-dan-daerah', 'Konsultasi Dokumen Perencanaan Nasional dan Daerah', 3, 'publik', $j${"deskripsi": "Jenis layanan ini merupakan pelayanan yang diberikan kepada Kementerian/Lembaga/Pemerintah Daerah/DPRD dalam rangka menyusun atau menyesuaikan dokumen perencanaan nasional dan daerah, yang mencakup Rencana Strategis (Renstra) dan Rencana Kerja (Renja) K/L, serta Rencana Pembangunan Jangka Menengah Daerah (RPJMD) dan Rencana Kerja Pemerintah Daerah (RKPD) Provinsi/Kabupaten/Kota, termasuk penyelarasannya dengan Rencana Pembangunan Jangka Menengah Nasional (RPJMN).", "ruang_lingkup": [], "unit_pengampu": [], "lampiran": []}$j$::jsonb),
  ('jenis_layanan', 'fasilitasi-pendampingan-perencanaan-pembangunan-nasional', 'Fasilitasi Pendampingan Perencanaan Pembangunan Nasional', 4, 'publik', $j${"deskripsi": "Jenis layanan ini merupakan layanan yang diberikan kepada Kementerian/Lembaga, Pemerintah Daerah, DPRD, masyarakat umum, mahasiswa, lembaga nonpemerintah, dan organisasi masyarakat, khususnya dalam rangka mendukung pemahaman serta penjabaran teknis dan substantif mengenai keterkaitan perencanaan pembangunan di tingkat pusat dan daerah.", "ruang_lingkup": [], "unit_pengampu": [], "lampiran": []}$j$::jsonb),
  ('jenis_layanan', 'fasilitasi-penyusunan-model-model-pembangunan', 'Fasilitasi Penyusunan Model-Model Pembangunan', 5, 'publik', $j${"deskripsi": "Jenis layanan ini merupakan layanan yang diberikan kepada Kementerian/Lembaga, Pemerintah Daerah, DPRD, masyarakat umum, mahasiswa, lembaga nonpemerintah, dan organisasi masyarakat dalam rangka meningkatkan pemahaman mengenai pengembangan inovasi di bidang perencanaan pembangunan.", "ruang_lingkup": [], "unit_pengampu": [], "lampiran": []}$j$::jsonb),
  ('jenis_layanan', 'fasilitasi-penyusunan-rencana-akse-percepatan-pembangunan-nasional', 'Fasilitasi Penyusunan Rencana Aksi Percepatan Pembangunan Nasional', 6, 'publik', $j${"deskripsi": "Jenis layanan ini merupakan layanan yang diberikan kepada Pemerintah Daerah, DPRD, masyarakat umum, mahasiswa, lembaga nonpemerintah, dan organisasi masyarakat dalam rangka mendukung perumusan kerangka hingga pemantauan rencana aksi pelaksanaan kegiatan percepatan pembangunan nasional, termasuk upaya mengidentifikasi dan mengatasi hambatan (debottlenecking) dalam pelaksanaan pembangunan nasional.", "ruang_lingkup": [], "unit_pengampu": [], "lampiran": []}$j$::jsonb),
  ('jenis_layanan', 'fasilitasi-kegiatan-tematis-perencanaan-pembangunan-nasional', 'Fasilitasi Kegiatan Tematis Perencanaan Pembangunan Nasional', 7, 'publik', $j${"deskripsi": "Jenis layanan ini merupakan layanan yang diberikan kepada Pemerintah Daerah, DPRD, masyarakat umum, mahasiswa, lembaga nonpemerintah, dan organisasi masyarakat dalam rangka mendukung penyusunan perencanaan pembangunan berbasis tema tertentu agar selaras dengan prioritas pembangunan nasional.", "ruang_lingkup": [], "unit_pengampu": [], "lampiran": []}$j$::jsonb),
  ('jenis_layanan', 'fasilitasi-pendampingan-perhitungan-indikator-tematik', 'Fasilitasi Pendampingan Perhitungan Indikator Tematik', 8, 'publik', $j${"deskripsi": "Jenis layanan ini merupakan layanan yang diberikan kepada Pemerintah Daerah, DPRD, masyarakat umum, mahasiswa, lembaga nonpemerintah, dan organisasi masyarakat dalam rangka mendukung penyusunan dan perhitungan indikator tematik, seperti Blue Economy, GRK, IMD, dan indikator tematik lainnya dalam perencanaan pembangunan nasional.", "ruang_lingkup": [], "unit_pengampu": [], "lampiran": []}$j$::jsonb),
  ('layanan_lainnya', 'penerimaan-mahasiswa', 'Penerimaan Mahasiswa', 1, 'publik', $j${"penjelasan": "Layanan penerimaan mahasiswa magang/PKL di lingkungan Kedeputian PMP.", "kontak": {"nama": "", "wa": "", "email": ""}}$j$::jsonb),
  ('layanan_lainnya', 'pemanfaatan-ruang-pmo', 'Pemanfaatan Ruang PMO', 2, 'publik', $j${"penjelasan": "Permohonan penggunaan ruang rapat/PMO untuk kegiatan koordinasi.", "kontak": {"nama": "", "wa": "", "email": ""}}$j$::jsonb),
  ('layanan_lainnya', 'penerimaan-tamu-dinas', 'Penerimaan Tamu Dinas', 3, 'publik', $j${"penjelasan": "Permohonan kunjungan/tamu dinas dari instansi lain ke Kedeputian PMP.", "kontak": {"nama": "", "wa": "", "email": ""}}$j$::jsonb),
  ('teknis', 'teknis-permohonan', 'Teknis Permohonan Layanan', 1, 'publik', $j${"poster_url": "", "wa": "", "email": ""}$j$::jsonb),
  ('survey', 'survey-kepuasan', 'Survey Kepuasan Masyarakat', 1, 'publik', $j${"poster_url": "", "link": ""}$j$::jsonb)
ON CONFLICT (slug) DO NOTHING;
