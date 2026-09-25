# DATA-NOTES — Renstra PMP 2025–2029

Ringkasan halaman dan angka diambil dari `docs/references/Renstra-Dep-PMP-2025-2029.pdf` (154 halaman file).

## Konvensi sitasi halaman
- `PDF Renstra file hlm. X` = nomor halaman **file PDF** (yang dipakai `pdftotext -f/-l`).
- `hlm. dokumen Y` = nomor halaman **tercetak** pada footer dokumen. Pada dokumen ini selisihnya konsisten 6 (file 63 = dokumen 57).
- Tabel yang baru ditranskripsikan memakai sitasi ganda (file + dokumen) agar dapat diverifikasi ulang. Tabel lama yang belum disentuh masih memakai satu nomor halaman seperti sebelumnya — lihat bagian *Pending*.

## Status item yang dikerjakan (SELESAI)
1. **Tabel 2.7 lengkap.** Seluruh **31 baris** strategi (No, Strategi, Pendetailan Strategi dan Rencana Aksi) ditranskripsikan penuh dari PDF file **hlm. 63–72** (dokumen 57–66); label Tabel 2.7 ada di file hlm. 63 dan Tabel 2.8 di file hlm. 72. Baris ringkasan "4–16" dan "17–31" sudah dihapus dan diganti rincian asli. Redaksi sumber dipertahankan, termasuk kekeliruan ketik sumber (mis. "ABPN", "intensif fiskal", "Peneyelenggaaraan") tanpa koreksi diam-diam.
2. **Sel lanjutan Tabel 2.4, 2.5, dan 2.6 terselesaikan.** Tidak ada lagi placeholder `[teks tabel berlanjut pada sumber]` / `[kosong pada sumber]`.
   - **Tabel 2.4** (file hlm. 49–50): sel kolom Pembiayaan dilanjutkan ("...fiskal, dan moneter dalam penyusunan APBN"), kolom Perencanaan mendapat butir tambahan, dan kolom Pemampu/Enabler butir ketiga dilengkapi. Catatan: butir 1 dan 3 kolom Pemampu/Enabler memang identik pada sumber dan dibiarkan apa adanya.
   - **Tabel 2.5** (file hlm. 55–56): 4 baris awal + 5 baris lanjutan hlm. 56 (Tingkat Tata Kelola Internal, Indeks Kepuasan Pemangku Kepentingan, Indeks Kualitas Sistem dan Informasi, Tingkat Kepatuhan Internal). Kolom yang memang kosong pada sumber dibiarkan kosong, bukan ditebak.
   - **Tabel 2.6** (file hlm. 56–63): **52 baris** (7 baris judul sasaran strategis/indikator + 45 baris data). Sel gabungan pada kolom IKU Deputi dan Output Kegiatan diisi ulang di setiap baris kelompok supaya tabel tetap terbaca pada layar sempit; sel yang memang kosong pada sumber dibiarkan kosong.
3. **Detail SDM/ABK.** Tabel ringkas 3 baris diganti/dilengkapi dengan:
   - **Tabel 1.4** Sebaran Pegawai berdasarkan jabatan fungsional dan pelaksana (file hlm. 28–29, total 136 ASN);
   - **Tabel 1.5** Pemetaan Kondisi Eksisting dan Kebutuhan Pegawai — **39 baris jabatan fungsional** dengan kolom ABK, sebaran kebutuhan per 6 unit (PEMPMP, PHKEI, PFMSK, P4T, SITALA, SEKDEP), kolom eksisting (PNS, PNS 2025, PPPK), dan GAP; total ABK 289, eksisting 111, **gap 178** (file hlm. 29–30);
   - **Tabel 1.5 (lanjutan)** jabatan pelaksana (4 baris, file hlm. 30);
   - ringkas grafik tetap memakai 3 kelompok terbesar gap (Perencana Ahli Muda 49, Perencana Ahli Madya 33, jabatan fungsional/pelaksana lainnya 96) yang berjumlah tepat 178;
   - rencana pengembangan SDM 2025–2029 (Core Value, penataan & pemenuhan SDM, karier & talenta, monitoring-evaluasi, pendidikan, tenaga non-ASN) dari file hlm. 32–36.
4. **Detail peta proses bisnis hlm. 77–117 (Gambar 2.6–2.12).** `processMap.ts` kini memuat 10 kartu (4 berdasarkan fungsi + 6 unit kerja) dengan langkah proses bernomor yang disusun dari narasi sumber, bukan ringkasan satu baris.
   - Fungsi: Perencanaan (file hlm. 77–79), Pengendalian (79–80, daftar pemantauan a–f dan evaluasi a–f), Pemampu/Enabler (80–81), Tata Kelola/GRC (81–83).
   - Unit: PEMPMP (83–94), PFMSK (95–103), PHKEI (104–108), P4T (109–112), Sitala Renbang (112–115), Sekretariat Deputi (116–117).
   - **Diagram yang hanya tersedia sebagai gambar** diberi catatan eksplisit + sitasi, tanpa mengarang isi diagram: Gambar 2.6 (file hlm. 78), 2.7 (85), 2.8 (95), 2.9 (104), 2.10 (109), 2.11 (113), dan 2.12 (117). Untuk kartu-kartu ini langkah diambil dari narasi halaman sekitarnya dan dinyatakan demikian pada catatan kartu.

## Catatan lain yang tetap dipertahankan
- Pendanaan memakai angka per tahun pada Bab 3.4 (Tabel 3.11, file hlm. 141 dst. / dokumen 135 dst.). Tabel sumber memiliki ketidaksesuaian antara kolom Total per unit, jumlah lima tahun, dan total keseluruhan; halaman menampilkan catatan tersebut secara eksplisit dan tidak melakukan koreksi diam-diam.
- Ekstraksi PDF bersifat heuristik; redaksi yang tampak terpotong/ambigu tidak dinormalisasi diam-diam. Tautan unduhan memakai salinan PDF sumber di `frontend/public/references/`.
- Sel kosong pada tabel berarti tidak diisi pada sumber, bukan data yang hilang.

## Pending / belum dikerjakan
- Tabel **2.1, 2.2, 3.1, 3.2, 3.4–3.10** belum ditampilkan pada halaman (hanya dirujuk naratif).
- Tabel **1.1** dan **2.2** masih tersedia hanya di PDF sumber.
- Sitasi halaman pada tabel 1.2, 1.3, 2.3, 2.8, 2.9, 2.10, 3.3, dan 3.11 belum diseragamkan ke format ganda file/dokumen.
- Kartu unit pada peta proses bisnis belum menampilkan isi diagram (Gambar 2.6–2.12) karena diagram berupa gambar; perlu konversi manual/vision bila isi diagram ingin ditampilkan.
