# DAFTAR ISI

1. Pendahuluan
2. Deskripsi Sistem
3. Aktor dan Peran Pengguna
4. Kebutuhan Fungsional
  4.1. Website PMP Publik
  4.2. Portal Internal PMP
  4.3. Manajemen Konten
  4.4. Early Warning System
  4.5. Pantau Berita PKPN
  4.6. PMP Library (Manajemen Dokumen)
  4.7. Dashboard Internal
  4.8. Asisten AI (Playground & Chat)
  4.9. Manajemen Akses dan Audit
5. Kebutuhan Non-Fungsional
  5.1. Keamanan
  5.2. Kinerja
  5.3. Ketersediaan
  5.4. Antarmuka
  5.5. Kompatibilitas
6. Arsitektur Sistem
7. Model Data
8. Integrasi
9. Pengujian
10. Dokumentasi

---

# 1. Pendahuluan

## 1.1 Tujuan Dokumen

Dokumen ini merupakan Spesifikasi Kebutuhan Perangkat Lunak (SKPL) / Software Requirements Specification (SRS) untuk sistem Macro Intelligence Hub (MIH). Dokumen ini menjelaskan secara rinci kebutuhan fungsional dan non-fungsional sistem, aktor pengguna, arsitektur, serta model data yang menjadi acuan pengembangan.

## 1.2 Ruang Lingkup

Macro Intelligence Hub adalah ekosistem digital Kedeputian Bidang Perencanaan Makro Pembangunan, Kementerian PPN/Bappenas. Sistem mencakup:

- Portal publik (website PMP) untuk profil, berita, publikasi, dan dashboard publik
- Portal internal untuk dashboard internal, perpustakaan digital, dan asisten AI
- Early Warning System untuk pemantauan berita dan sentimen
- Pantau Berita PKPN untuk analisis 8 klaster prioritas nasional
- Manajemen dokumen (RAG pipeline) dengan chunking dan embedding

## 1.3 Definisi dan Singkatan

| Istilah | Definisi |
|---|---|
| MIH | Macro Intelligence Hub |
| PKPN | Program Kerja Prioritas Nasional |
| SSO | Single Sign-On |
| RAG | Retrieval-Augmented Generation |
| JWT | JSON Web Token |
| LLM | Large Language Model |

---

# 2. Deskripsi Sistem

## 2.1 Pernyataan Masalah

Aset digital Kedeputian Bidang Perencanaan Makro Pembangunan (data, dashboard, kajian, publikasi) berada pada berbagai platform yang belum terhubung. Hal ini menyulitkan:
- Pencarian lintas informasi
- Pengelolaan pengetahuan institusional
- Pemantauan isu makro dan PKPN secara real-time
- Pemanfaatan data untuk analisis kebijakan berbasis AI

## 2.2 Tujuan Sistem

1. Mengintegrasikan aset digital dalam satu ekosistem
2. Menyediakan akses cepat ke informasi makro dan PKPN
3. Mendeteksi isu dan risiko secara dini melalui analisis berita otomatis
4. Mendukung analisis kebijakan dengan bantuan AI
5. Menyediakan manajemen pengetahuan institusional

## 2.3 Batasan Sistem

- Integrasi SSO Bappenas untuk portal internal
- Akses API model AI Bappenas (on-premise)
- Konten publik dapat diakses tanpa autentikasi
- Konten internal hanya untuk pegawai terautentikasi

---

# 3. Aktor dan Peran Pengguna

| Kategori | Wewenang | Hak Akses |
|---|---|---|
| Administrator Sistem | Mengelola konfigurasi teknis, user, dan akses | Admin penuh |
| Administrator Konten | Mengelola dan mempublikasikan konten | Manajemen konten |
| Kontributor Unit Kerja | Mengajukan/memperbarui materi unit kerja | Terbatas sesuai unit |
| Pegawai PMP | Mengakses portal internal dan layanan | SSO + RBAC |
| Pengguna Publik | Mengakses informasi publik | Tanpa login |

---

# 4. Kebutuhan Fungsional

## 4.1 Website PMP Publik (Prioritas: Tinggi)

| ID | Kebutuhan |
|---|---|
| F-01 | Menampilkan profil Kedeputian (visi, misi, struktur organisasi) |
| F-02 | Menampilkan berita dan pengumuman terkini |
| F-03 | Menyediakan katalog publikasi (laporan, kajian, buku) |
| F-04 | Menyediakan layanan pengaduan/informasi publik |
| F-05 | Dashboard publik (indikator makro) |
| F-06 | Pencarian konten publik |

## 4.2 Portal Internal PMP (Prioritas: Tinggi)

| ID | Kebutuhan |
|---|---|
| F-07 | Autentikasi melalui SSO Bappenas |
| F-08 | Dashboard internal peran pengguna |
| F-09 | Navigasi ke seluruh modul internal |
| F-10 | Manajemen profil pengguna |

## 4.3 Manajemen Konten (Prioritas: Tinggi)

| ID | Kebutuhan |
|---|---|
| F-11 | Membuat, mengedit, dan menghapus konten (berita, publikasi, halaman) |
| F-12 | Alur persetujuan konten (draft → review → publish) |
| F-13 | Klasifikasi konten (publik/internal) |
| F-14 | Penjadwalan publikasi |
| F-15 | Riwayat perubahan konten |

## 4.4 Early Warning System (Prioritas: Tinggi)

| ID | Kebutuhan |
|---|---|
| F-16 | Crawl RSS feed secara otomatis (6 sumber lokal + 2 internasional) |
| F-17 | Analisis sentimen otomatis (lexicon + LLM) |
| F-18 | Deteksi level kewaspadaan (danger/warning/info) |
| F-19 | Dashboard widget dengan ringkasan alert |
| F-20 | Filter berdasarkan sumber, sentimen, tanggal |
| F-21 | Tren sentimen 7 hari |
| F-22 | Notifikasi alert baru |

## 4.5 Pantau Berita PKPN (Prioritas: Tinggi)

| ID | Kebutuhan |
|---|---|
| F-23 | Crawl dan analisis berita terkait 8 klaster PKPN |
| F-24 | Penilaian 3 sumbu: relevansi (0-3), dampak (positif/negatif/netral), sentimen teks |
| F-25 | Deteksi klaster PKPN otomatis via highlight.js |
| F-26 | Highlight keyword PKPN dan makropembangunan |
| F-27 | Filter berdasarkan klaster, dampak, relevansi minimal |
| F-28 | Tren mingguan dampak per klaster |
| F-29 | Antrean review manual untuk skor meragukan |
| F-30 | Integrasi LLM scoring dengan fallback kode |

## 4.6 PMP Library (Manajemen Dokumen) (Prioritas: Sedang)

| ID | Kebutuhan |
|---|---|
| F-31 | Upload dokumen (PDF, DOCX, PPTX) |
| F-32 | Ekstraksi teks otomatis (termasuk OCR untuk scan) |
| F-33 | Chunking dan embedding untuk RAG pipeline |
| F-34 | Pencarian semantik dokumen |
| F-35 | Klasifikasi dokumen (jenis, unit kerja, tema) |
| F-36 | Riwayat akses dan versi dokumen |
| F-37 | Sinkronisasi dengan SharePoint (rclone) |

## 4.7 Dashboard Internal (Prioritas: Sedang)

| ID | Kebutuhan |
|---|---|
| F-38 | Dashboard manajemen risiko (6 jenis deteksi otomatis) |
| F-39 | Dashboard monitoring anggaran (penyerapan, pagu, realisasi) |
| F-40 | Dashboard kinerja unit kerja |
| F-41 | Dashboard makro ekonomi |
| F-42 | Ekspor data dashboard (PDF/Excel) |

## 4.8 Asisten AI (Prioritas: Sedang)

| ID | Kebutuhan |
|---|---|
| F-43 | AI Chat berbasis RAG (tanya dokumen) |
| F-44 | Playground untuk eksperimen prompt |
| F-45 | Highlight jawaban dengan sumber dokumen |
| F-46 | Riwayat percakapan per pengguna |
| F-47 | Fallback model (OpenRouter → DeepSeek langsung) |

## 4.9 Manajemen Akses dan Audit (Prioritas: Tinggi)

| ID | Kebutuhan |
|---|---|
| F-48 | Manajemen pengguna dan peran (RBAC) |
| F-49 | Log aktivitas pengguna |
| F-50 | Audit trail perubahan data sensitif |
| F-51 | Laporan akses periodik |

---

# 5. Kebutuhan Non-Fungsional

## 5.1 Keamanan

| ID | Kebutuhan |
|---|---|
| NF-01 | Autentikasi via SSO Bappenas (SAML/OIDC) |
| NF-02 | JWT token untuk akses API (24 jam expiry) |
| NF-03 | Cookie session fallback untuk backward compat |
| NF-04 | HTTPS/TLS untuk seluruh koneksi |
| NF-05 | RBAC (Role-Based Access Control) |
| NF-06 | Validasi input di semua endpoint |
| NF-07 | Rate limiting pada endpoint login |
| NF-08 | Audit log untuk aktivitas penting |

## 5.2 Kinerja

| ID | Kebutuhan |
|---|---|
| NF-09 | Waktu muat halaman < 3 detik |
| NF-10 | API response time < 500ms (endpoint baca) |
| NF-11 | Crawl RSS selesai < 10 menit untuk 8 sumber |
| NF-12 | Chunking dokumen < 30 detik per file (500 halaman) |
| NF-13 | Mendukung 100+ pengguna simultan |

## 5.3 Ketersediaan

| ID | Kebutuhan |
|---|---|
| NF-14 | Uptime 99% (kecuali maintenance terjadwal) |
| NF-15 | Backup database otomatis harian |
| NF-16 | Bind mount untuk data PostgreSQL (survive restart) |
| NF-17 | Healthcheck endpoint tiap service |

## 5.4 Antarmuka

| ID | Kebutuhan |
|---|---|
| NF-18 | Antarmuka responsif (desktop + mobile) |
| NF-19 | Dark mode dan light mode |
| NF-20 | Bahasa Indonesia sebagai bahasa utama |
| NF-21 | Aksesibilitas WCAG AA |
| NF-22 | Tema konsisten dengan portal Bappenas |

## 5.5 Kompatibilitas

| ID | Kebutuhan |
|---|---|
| NF-23 | Browser: Chrome, Firefox, Edge (2 versi terbaru) |
| NF-24 | Stack: React 18 + Vite, Bun + Express, PostgreSQL 16 |
| NF-25 | Container: Docker Compose |
| NF-26 | Reverse proxy: nginx |

---

# 6. Arsitektur Sistem

## 6.1 Arsitektur Mikroservis (Target)

```
┌──────────────────────────────────────────────────┐
│                     VPS (nginx)                    │
│  mih.keuanganppn1.cloud:443                       │
│  remote.keuanganppn1.cloud:443                    │
│  (sertifikat TLS/SSL)                             │
└────────┬────────────┬────────────┬────────────────┘
         │            │            │
    ┌────▼────┐ ┌────▼────┐ ┌────▼────┐
    │ Backend │ │Analisis │ │ Artikel │
    │(existing)│ │Service  │ │ Service │
    │ port    │ │ port    │ │ port    │
    │ 3000    │ │ 3102    │ │ 3103    │
    └────┬────┘ └────┬────┘ └────┬────┘
         │            │            │
    ┌────▼────────────────────────▼────┐
    │         PostgreSQL 16            │
    └─────────────────────────────────┘
```

## 6.2 Stack Teknologi

| Komponen | Teknologi | Versi |
|---|---|---|
| Frontend | React + Vite + TypeScript | React 18 |
| Backend | Bun + Express + TypeScript | Bun 1.x |
| Database | PostgreSQL | 16 |
| Container | Docker + Docker Compose | 3.x |
| Proxy | nginx | 1.24+ |
| Worker (Python) | Python + sentence-transformers | 3.12 |
| Auth | JWT + Cookie (dual) | — |

---

# 7. Model Data

## 7.1 Tabel Utama

| Tabel | Fungsi |
|---|---|
| `users` | Data pengguna internal |
| `content` | Konten CMS (berita, halaman, publikasi) |
| `documents` | Dokumen perpustakaan |
| `chunks` | Chunk teks dengan embedding vektor |
| `early_warnings` | Artikel Early Warning + sentimen |
| `articles` | Artikel PKPN 3-axis scoring |
| `article_scores` | Skor per artikel (3 sumbu) |
| `reviews` | Review manual |
| `conversations` | Riwayat chat AI |
| `messages` | Pesan dalam percakapan |
| `api_tokens` | Token akses API |
| `usage_logs` | Log penggunaan |

---

# 8. Integrasi

## 8.1 Integrasi SSO

- Protokol: SAML 2.0 / OIDC
- Penyedia: SSO Bappenas (Pusdatinrenbang)
- Ruang lingkup: autentikasi portal internal
- Atribut: NIP, nama, email, unit kerja, peran

## 8.2 Integrasi AI

- Model: LLM on-premise via OpenRouter API / DeepSeek fallback
- Embedding: sentence-transformers (worker Python)
- Pipeline: dokumen → chunk → embedding → vektor DB → RAG
- Keamanan: akses API memerlukan JWT valid

## 8.3 Integrasi SharePoint

- Tools: rclone
- Mekanisme: sync tiap 15 menit
- Tujuan: `/data/mih/rclone/` → upload ke MIH
- Dokumen: 763 file (1.685 GiB)

---

# 9. Pengujian

| Jenis | Cakupan | Metode |
|---|---|---|
| Fungsional | Semua fitur sesuai SRS | UAT (User Acceptance Test) |
| Integrasi | SSO, API AI, database | Skenario end-to-end |
| Keamanan | OWASP Top 10, RBAC | Penetration test |
| Performa | Response time, concurrency | Load test (100+ user) |
| Penerimaan | Kesesuaian KAK | UAT bersama pengguna |

---

# 10. Dokumentasi

Dokumen yang akan disusun:

1. **Dokumen Kebutuhan Sistem** — SRS ini
2. **Dokumen Desain** — Arsitektur, model data, antarmuka
3. **Dokumen Teknis** — API spec, konfigurasi, deployment
4. **Panduan Pengguna** — Manual penggunaan portal
5. **Panduan Administrator** — Manual operasional dan pemeliharaan
6. **Laporan Pengujian** — Hasil seluruh pengujian
7. **Laporan Pelaksanaan** — Realisasi kegiatan

---

# Lampiran A — Matriks Fitur vs Prioritas

| Fitur | Prioritas | Status Implementasi |
|---|---|---|
| Website PMP Publik | Tinggi | ✅ 100% |
| Dashboard Publik | Tinggi | ✅ 100% |
| Portal Internal PMP | Tinggi | ✅ 100% |
| Manajemen Konten | Tinggi | ✅ 80% (perlu validasi role) |
| Early Warning System | Tinggi | ✅ 100% |
| Pantau Berita PKPN | Tinggi | ✅ 100% (v1) |
| PMP Library (RAG) | Sedang | ✅ 90% (worker running) |
| Dashboard Internal | Sedang | ✅ 70% (risiko + monitoring) |
| Asisten AI | Sedang | ✅ 80% (chat + playground) |
| Manajemen Akses | Tinggi | ✅ 100% (JWT + RBAC) |

# Lampiran B — Glossary Teknis

| Istilah | Definisi |
|---|---|
| RAG | Retrieval-Augmented Generation — pencarian semantik dokumen + jawaban AI |
| Chunking | Pemotongan teks menjadi segmen untuk embedding |
| Embedding | Vektor numerik representasi teks untuk pencarian semantik |
| 3-Axis Scoring | Tiga dimensi penilaian: relevansi, dampak, sentimen teks |
| Lexicon Score | Skor sentimen berbasis kamus kata (deterministik) |
| JWT | JSON Web Token — format token autentikasi