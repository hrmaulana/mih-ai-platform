# Software Requirements Specification (SRS)
## Macro Intelligence Hub (MIH) — Kedeputian PMP Bappenas

**Dokumen ini dibuat berdasarkan analisis kode sumber yang SESUNGGUHNYA ada di repositori.**
**Setiap fitur, endpoint, dan tabel database yang disebutkan telah diverifikasi dari kode.**
**Tidak ada fitur yang dibuat-buat atau direkayasa.**

---

## 1. Pendahuluan

### 1.1 Tujuan

Macro Intelligence Hub (MIH) adalah platform internal Kedeputian Perencanaan Makro Pembangunan (PMP) Bappenas yang menyediakan:

1. **Sistem Tanya-Jawab Berbasis RAG** — menjawab pertanyaan pengguna berdasarkan dokumen perencanaan makro (paparan, laporan, PDF, PPTX, DOCX) dengan sitasi.
2. **Early Warning System** — crawling berita dari RSS feed nasional & internasional, analisis sentimen (lexicon + LLM), dan deteksi klaster PKPN.
3. **Pantau Berita PKPN** — pipeline scoring 3-axis (relevansi, dampak, sentimen teks) untuk berita yang terkait program PKPN.
4. **Manajemen Dokumen** — upload, parsing, chunking, embedding, dan pencarian vektorisasi.
5. **Asisten AI (Playground)** — chat interaktif streaming dengan konteks dokumen dan riwayat percakapan.
6. **Portal Publik** — landing page, berita, publikasi, profil kedeputian, unit, layanan.
7. **Admin Panel** — manajemen pengguna, token API, konten publik (CRUD), dan log penggunaan.

### 1.2 Ruang Lingkup

Sistem terdiri dari:
- Backend monolith (Express.js + TypeScript, runtime Bun)
- Worker dokumen (Python 3.12) untuk parsing, chunking, embedding, dan sinkronisasi Google Drive/SharePoint
- Microservices terpisah: crawler, analisis, artikel (masing-masing dengan Docker container sendiri)
- Frontend SPA (React + Vite + Tailwind CSS + FluentUI)
- Database PostgreSQL dengan ekstensi pgvector
- Integrasi AI: OpenAI (GPT-4o-mini, text-embedding-3-small), dengan fallback ke DeepSeek

### 1.3 Definisi dan Singkatan

| Istilah | Definisi |
|---------|----------|
| MIH | Macro Intelligence Hub |
| PMP | Perencanaan Makro Pembangunan |
| PKPN | Program Pembangunan — 8 klaster tematik |
| RAG | Retrieval-Augmented Generation |
| EWS | Early Warning System |
| RSS | Really Simple Syndication (format sindikasi berita) |
| LLM | Large Language Model |
| RAG Webhook | Webhook ke n8n untuk retrieval alternatif |
| rclone | Alat sinkronisasi file ke Google Drive/SharePoint |
| JWT | JSON Web Token (untuk autentikasi API) |
| SPA | Single Page Application |

---

## 2. Deskripsi Sistem (Berdasarkan Kode yang Ada)

### 2.1 Arsitektur Keseluruhan

MIH menggunakan arsitektur **monolith + microservices**:

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
│          React SPA (Vite) → Nginx (static serving)          │
│                    Port 80/443                               │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP/HTTPS
┌──────────────────────▼──────────────────────────────────────┐
│                    REVERSE PROXY                             │
│                    Nginx (deploy)                            │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                    BACKEND (Bun/Express)                      │
│  ┌──────────┬──────────┬──────────┬──────────┬───────────┐ │
│  │ Auth     │ RAG/Ask  │ Chat     │ EWS      │ Admin     │ │
│  │ Routes   │ Routes   │ Routes   │ Routes   │ Routes    │ │
│  └──────────┴──────────┴──────────┴──────────┴───────────┘ │
│  ┌──────────┬──────────┬──────────┬──────────┬───────────┐ │
│  │ Content  │ Pantau   │ Documents│ Skills   │ Manajemen │ │
│  │ Routes   │ Berita   │ Routes   │ Routes   │ Risiko*   │ │
│  └──────────┴──────────┴──────────┴──────────┴───────────┘ │
└──────────────┬──────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────┐
│                    WORKER (Python 3.12)                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
│  │ Parsing  │  │ Chunking │  │Embedding │  │ rclone    │  │
│  │ (PDF/    │  │ (text    │  │(OpenAI)  │  │ Sync     │  │
│  │ PPTX/    │  │ split)   │  │          │  │ (Drive/   │  │
│  │ DOCX)    │  │          │  │          │  │ SharePoint│  │
│  └──────────┘  └──────────┘  └──────────┘  └───────────┘  │
│  HTTP API Port 3200 (healthcheck + retry)                    │
└──────────────┬──────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────┐
│         MICROSERVICES (Docker, port terpisah)                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │ Crawler  │  │ Analisis │  │ Artikel  │                  │
│  │ (RSS     │  │ (Lexicon │  │ Service  │                  │
│  │ Fetch)   │  │ + LLM)   │  │          │                  │
│  └──────────┘  └──────────┘  └──────────┘                  │
└──────────────┬──────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────┐
│                  DATABASE (PostgreSQL + pgvector)            │
│  12 tabel: documents, chunks, users, api_tokens,             │
│  usage_logs, content, conversations, messages,               │
│  early_warnings, articles, article_scores, reviews          │
└─────────────────────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────┐
│              EXTERNAL INTEGRATIONS                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
│  │ OpenAI   │  │ DeepSeek │  │ n8n RAG  │  │ Google    │  │
│  │ (GPT-4o, │  │ (Chat,   │  │ Webhook  │  │ Drive +   │  │
│  │ Embed)   │  │ Fallback)│  │(opsional)│  │ SharePoint│  │
│  └──────────┘  └──────────┘  └──────────┘  └───────────┘  │
└─────────────────────────────────────────────────────────────┘
```

> \* Manajemen Risiko: tidak ditemukan sebagai route tersendiri di kode backend. Fungsi deteksi otomatis risiko belum diimplementasikan (masih dalam dokumentasi rencana).

### 2.2 Komponen Sistem

#### 2.2.1 Backend (Bun/Express) — `backend/src/`

Komponen utama yang menangani seluruh logika bisnis. File entry: `backend/src/index.ts` → `app.ts`.

**Library utama (dari package.json):**
- express, cors, helmet
- pg (PostgreSQL client)
- openai (AI API)
- multer (file upload)
- jsonwebtoken, bcryptjs
- pptxgenjs (generasi PPTX)
- compression, uuid

#### 2.2.2 Worker (Python) — `worker/`

File entry: `worker/ingest.py` dengan mode `watch()`.

**Tanggung jawab:**
1. **Parsing dokumen** — PDF (pypdf + pytesseract OCR), PPTX (python-pptx), DOCX (python-docx)
2. **Chunking** — pembagian teks menjadi segmen berdasarkan struktur dokumen
3. **Embedding** — vektorisasi chunk via OpenAI API
4. **Sinkronisasi** — rclone sync dari Google Drive dan SharePoint ke `/data/raw/`
5. **Pruning** — hapus dokumen dari database jika file sumber sudah tidak ada di disk
6. **HTTP API** — server di port 3200 untuk healthcheck dan retry dokumen

#### 2.2.3 Microservices

Tiga service mandiri (masing-masing dengan Dockerfile sendiri):

| Service | Fungsi | Port (default) |
|---------|--------|----------------|
| **Crawler** (`backend/services/crawler/`) | Fetch RSS feed, analisis sentimen (lexicon + LLM), deteksi PKPN | - |
| **Analisis** (`backend/services/analisis/`) | Analisis sentimen leksikal + LLM, scoring berita | - |
| **Artikel** (`backend/services/artikel/`) | Manajemen artikel berita | - |

Ketiga service memiliki struktur yang mirip: lib/ (jwt, highlight, lexicon, llm-sentiment), middleware/ (auth), routes/ (endpoint REST), dan konfigurasi sendiri.

#### 2.2.4 Frontend (React + Vite) — `frontend/`

**Teknologi:**
- React 18, React Router DOM 6
- FluentUI React Components (Microsoft)
- Tailwind CSS
- Vite bundler
- Rich Text Editor (TipTap/ProseMirror)

**Struktur halaman:**
- **Publik (guest + logged-in):** PortalHome, PortalNews, PortalPublication, PortalDeputy, PortalUnit, PortalService, PortalDashboard, EarlyWarning
- **Internal (logged-in only):** Playground (AI Chat), Documents (daftar), DocumentGraph (relasi), Admin (CRUD)
- **Umum:** Login

---

## 3. Aktor dan Peran Pengguna

### 3.1 Pengunjung (Guest)

Belum login. Dapat mengakses:
- Landing page (PortalHome)
- Berita & publikasi publik
- Profil kedeputian, unit, pimpinan
- Layanan
- Dashboard publik (Early Warning)
- Login page

### 3.2 Pengguna Internal (User)

Sudah login. Memiliki hak:
- Semua akses publik
- Playground AI Chat (RAG)
- Daftar dokumen & relasi dokumen (graph)
- Dashboard dengan data real-time

### 3.3 Administrator (Admin)

User dengan `is_admin = true`. Memiliki hak tambahan:
- Manajemen pengguna (CRUD)
- Manajemen token API (buat, cabut)
- Manajemen konten publik (CRUD berita & publikasi)
- Upload & retry dokumen
- Trigger crawl RSS manual
- Lihat log penggunaan API
- Lihat antrean review Pantau Berita PKPN

### 3.4 Reviewer PKPN

User yang melakukan review manual terhadap skor artikel Pantau Berita PKPN (dapat berasal dari user biasa atau admin). Submit review ke route `/api/pantau-berita/review`.

### 3.5 Sistem / API Client

Program eksternal yang menggunakan **API Token** (Bearer `mih_...`) untuk mengakses endpoint `/api/ask` dan `/api/chat`. Scope: `internal-read`. Tunduk pada daily limit.

---

## 4. Kebutuhan Fungsional

### 4.1 Website Portal Publik

| ID | Kebutuhan | Prioritas | Status di Kode |
|----|-----------|-----------|----------------|
| F-01 | Landing page dengan hero, fitur, menu navigasi | Tinggi | ✅ Terimplementasi — `PortalHome.tsx` |
| F-02 | Daftar berita publik dari database `content` | Tinggi | ✅ Terimplementasi — `/api/content` → `PortalNews.tsx` |
| F-03 | Detail berita per slug | Tinggi | ✅ Terimplementasi — `/api/content/:slug` |
| F-04 | Daftar publikasi (jurnal, laporan) | Tinggi | ✅ Terimplementasi — `PortalPublication.tsx` |
| F-05 | Detail publikasi per slug | Tinggi | ✅ Terimplementasi |
| F-06 | Halaman profil kedeputian | Sedang | ✅ Terimplementasi — `PortalDeputy.tsx` |
| F-07 | Halamnn profil unith dengan konten dinamis | Sedang | ✅ Terimplementasi — PolUnit.tsx` |
| F-08 | Halaman profil pimpinn | Rendah | ✅ Terimplementasi — `PortalUnit.tsx` mode `leader` |
| F-09 | Hala mn layanan dengan konten  dinamis | Sedang | ✅ Terimplementasi — `PortalService.tsx` |
| F-10 | Dashboardmonitoring (Early Warning, dll.) | Tinggi | ✅ Terimplementasi — `PortalDashboard.tsx`, `EarlyWarning.tsx` |
| F-11 | Navigasi responsif (desktop + mobile) | Tinggi | ✅ Terimplementasi — `PortalHeader.tsx` |
| F-12 | Footer dengan informasi kontak | Renda h | ✅ Terimplementasi — `PortalFooter.tsx` |

**Detail implementasi:**
- Data portal (menu, gambar) berasal dari file `portal.css` dan komponen PortalLayout.
| Konten portal (berita & publikasi) disimpan di tabel `content` database, diakses via `/api/content` dan `/api/content/:slug`.
- Halaman profil, unit, pimpinan, dan layanan menggunakan sistem routing dinamis dengan slug.

### 4.2 Early Warning System (EWS)

| ID  | Kebutuhan | Prioritas | Status di Kode |
|-----|-----------|-----------|----------------|
| F-13 | Crawl 8 sumber RSS (CNBC, Katadata, Antara, Tempo Bisnis, Tempo Nasional, Lpuan6, Economist, Politico) | Tinggi | ✅ Terimplementasi — `POST /api/early-warning/crawl` |
| F-14 | Analisis sentimen hybrid: lexon + LLM | Tinggi | ✅ Terimplementasi — `lexicon.ts`, `llm-sentiment.ts` |
| F-15 | Deteksi klaster PKPN (1-8) pada berita | Tinggg | ✅ Terimplem ntasi — `highlight.ts` |
| F-16 | Skor relevansi PKPN 0-3 | Tinggg | ✅ Terimplem ntasi — `relevanceFloor()` |
| F-17 | Level alert (danger/warning/nfo) otomatis | Tinggi | ✅ Terimplementasi — `determineAlert()` |
| F-18 | Widget ringkasan dashboard | Tinggi | ✅ Terimplem entasi — `GET /api/earl-warning/summary` |
| F-19 | Daftar artikel dengan filter sumber, sentimen, alert, pencarian | Tinggi | ✅ erimplementasi —`GET /api/early-warning` |
| F-20 | Paginasi artikel | Sedang | ✅ Terimplementasi |
| F-21 | Tren sentimen 7 hari | Sedang | ✅ Terimplemetasi — dalam `GET /api/early-warning/summary` |

**Alur EWS:**
1. Admin memicu `/api/early-warning/crawl` (POST)
2. Sistem fetch 8 RSS feed secara paralel (timeout 15s per feed, max 10 item per feed)
3. Setiap artikel dicek duplikasi berdasarkan URL
4. Analisis sentimen hybrid:
   - **Lexicon phase**: hitung `calculateLexiconScore()` dari judul + konten
   - Jika `|score| >= 0.3` → confidence = "high", skip LLM
   - Jika `|score| < 0.3` → panggil `analyzeSentimentLLM()` → rata-rata dengan lexicon score → confidence = "medium"
5. Deteksi PKPN: `detectClusters()` + `relevanceFloor()` untuk skor 0-3
6. Tentukan alert level berdasarkan score + confidence (> -0.5 high = danger, > -0.3 high = warning, > -0.3 medium = waning)

**Sumber RSS:**
| Sumber | URL RSS |
|--------|---------|
| CNBC Indoneia | htps://www. cnbcindonesi.a.om/rss |
| Katadata | ps://katadata.o.i//rss |
| Antara Eknomi | htp://www.antaraew.co.id/rss/eknmi|
| Tepo Bisnis | http://rss.tempo.o/bsnis |
| Tepo Nasional | https://rss.tempo.co/nasional|
| Lputan6 Bisnis | htp://fe.lputan6.cm/rss/bisis |
| Eonomist Busines | https://w.conomst.com/business/rss.xm |
| olitico picks | htp://ww.poico.cm/rs/poliicpics.xm |

### 4.3 Pantau Berita PKPN

| ID | Kebutuhan | Prioritas | Status di Kode |
|----|-----------|-----------|----------------|
| F-22 | Crawl RSS feed ke tabel `articles` baru | Tinggi | ✅ Terimplementasi — `POST /api/pantau-berita/crawl` |
| F-23 | Deduplikasi URL (url_hash) dan konten (content_hash) | Tinggi | ✅ Terimplementasi |
| F-24 | Scoring 3-axis: relevansi (0-3), dampak, sentimen teks | Tinggi | ✅ Terimplementasi — `berita-scorer.ts` |
| F-25 | Deteksi klaster PKPN (1-8) per artikel | Tinggi | ✅ Terimplementasi |
| F-26 | Highlight keyword dalam teks | Sedang | ✅ Terimplementasi — `keyword_highlight` JSONB |
| F-27 | Floor relevance (lantai relevansi) | Sedang | ✅ Terimplementasi — `applyFloor()` |
| F-28 | Flag `perlu_review_manual` untuk artikel borderline | Sedang | ✅ Terimplementasi |
| F-29 | Ringkasan klaster PKPN (top 8) | Tinggi | ✅ Terimplementasi — `GET /api/pantau-berita/ringkasan-klaster` |
| F-30 | Tren mingguan relevansi dan dampak | Tinggi | ✅ Terimplementasi — `GET /api/pantau-berita/tren` |
| F-31 | Daftar berita dengan filter (dampak, minRel, klaster, perlu_review, q, sumber) | Tinggi | ✅ Terimplementasi — `GET /api/pantau-berita/berita` |
| F-32 | Daftar program PKPN per klaster | Sedang | ✅ Terimplementasi — `GET /api/pantau-berita/program` |
| F-33 | Antrean review manual | Sedang | ✅ Terimplementasi — `GET /api/pantau-berita/antrean-eview` |
|F-34 | Subit review manual | Tingi |✅ erimpleentasi — PST /ap/anau-beria/revew` |

**PipelineScoring 3-Axis** (dal `berita-scorer.ts`):
1. **Code Phase**:
   - `detectClusters(text)` → klaster PKN 1-8
   - `relevanceFloor(tex)` → floor reevansi 0-3
   - `calcuateLexiconSore(judul, konten)` → raw lexion score

2. **LLM phase** (menggunakan prompt di `scoring.v1.md`):
   - LLM dinstructed untuk memberika skr pda tiga sumbu:
     - Rlevansi (0-): 0=tak reevan, 1=erkait makro, 2=Cukup relevan, =Sangt relevan
     - Dampak: positi/egatif/netral/tidak_da
     - SentimenTeks: positi/negar/netral
   - Juga mengembalikan klaster PKN, topik, alsan, keyword_highlight

3. **Post-Process**:
   - `validatellmKeyords()`: bersihkan keyword ga valid
   - `applyFlooor()`: jika LLM scre < reevanceFloor, pakai floor (lantai)
   - `perlu_evie_anual`: true jik tertentu kndii borderline

**Klaster PPN (8 klaster):**

| ID | Klaster | Deskripsi |
|----|---------|-----------|
| 1 | Kedulata Pangan | Kedaulatan pangan |
| 2 | Kemandirian Energi dan Air | Energi dan air |
| 3 | Pendidikan | Pendidikan |
| 4 | Kesehatan | Kesehatan |
| 5 | Hilirisasi dan Industrialisasi | Hilirisasi |
| 6 | Ekonomi Kreatif dan Digital | Ekonomi kreatif & digital |
| 7 | Pariwisata dan Ekonomi Biru | Pariwisata & ekonomi biru |
| 8 | Pembangunan Wilayah | Pembangunan wilayah & desa |

### 4.4 Manajemen Dokument (RAG Pipeline)

| ID | Kebutuhan| Prioritas| Statu di Kode |
|----|----------|----------|----------------|
| F-35 | Uplod dokumen (PD, PTX, OCX) | Tingg |✅ Teimplemntasi — `PS /api/admin/documents` |
| F-36 | Deteksi duplikat (SHA265) | Tinggi | ✅ Terimpleentasi |
| F-37 | Parse dokumen (teks + struktur) | Tinggi | ✅ Terimplementasi — `worker/parsers/` |
| F-38 | Chunking teks berdasarkan struktur (slide, paragraph, page) | Tinggi | ✅ Terimplementasi — `worker/chunking.py` |
| F-39 | Embedding chunk (OpenAI text-embedding-3-small, 1536d) | Tinggi | ✅ Terimplemntasi — `worker/embedding.py`, `bakend/src/services/emebdings.ts` |
9 | Halaman graph relasi dokumen | Sedang | ✅ Terimplementasi — `GET /api/documents/graph` |
| F-41 | Download file mentah | Sedang | ✅ Terimpleentasi — `GET /api/docments/:id/file` |
| F-42 | Retry dokunen gagal | Sedang | ✅ Terimplementasis — `POST /a/admin/documents/i/retry` |
| F-43| Otomatis process dokunen (wath mong) | Tinggi | ✅ Terimplementasi — `worker/ingest.py watch()` |
| F-44 | Sinkronisasi Google Drive (rclone) | Sedang | ✅ erimplementasi — drive_sync()` |
| F-5| Sinkronisasi SharePint (clone) | Rendah | ✅Terimpleentasi — `harepoint_sn()`
45-136|Pruning fikang dihapus | Rendah | ✅ Terimplementasi — `pru_emved()` |

**Alur RAG Document Pipeline:**

```
Upload file (via Admin UI)
        │
        ▼
  ┌─ Backend ─────────────────────────────────────┐
  │ POST /api/admin/documents                     │
  │ • Validasi ekstensi (pptx/pdf/docx)            │
  │ • Hitung SHA265 → cek duplikat                │
  │ • Simpan ke /data/uploaded/                   │
  │ • Insert row ke tabel documents (status='pending')│
  └────────────────┬──────────────────────────────┘
                   │
  ┌─ Worker ───────▼──────────────────────────────┐
  │ watch() loop (default: polling 30 detik)      │
  │                                               │
  │ 1. GET pending dari database (FOR UPDATE      │
  │    SKIP LOCKED, max 10 per iterasi)           │
  │                                               │
  │ 2. Parse file:                                │
  │    • PDF  → pypdf + OCR (tesseract)           │
  │    • PPTX → python-pptx                       │
  │    • DOCX → python-docx                       │
  │                                               │
  │ 3. Chunk: segment → chunk_segments()          │
  │    (menggunakan tiktoken untuk token counting)│
  │                                               │
  │ 4. Embed: tiap chunk → vector 1536d via       │
  │    OpenAI text-embedding-3-small              │
  │                                               │
  │ 5. Insert ke tabel chunks + mark_outdated     │
  │    untuk file dengan nama sama sebelumnya     │
  │                                               │
  │ 6. Set status = 'completed' atau 'failed'     │
  └───────────────────────────────────────────────┘
```

**Sinkron Eksternal:**

```
Worker watch() loop (tiap DRIVE_SYNC_INTERVAL_MIN = 15 menit):
  1. Jika DRIVE_REMOTE di-set → rclone sync dari Google Drive
     ke /data/raw/drive/
  2. Jika SHAREPOINT_REMOTE di-set → rclone sync dari SharePoint
     ke /data/raw/sharepoint/
  3. scan_dir() untuk source 'drive'/'sharepoint':
     - Insert dokumen baru (source='drive'/'sharepoint')
     - Documen diproses secar norml oleh pipeline berikutnya
  4. prne_removed(): aps dokume dar datasae jika fie sumbe uda tida adi dik
```

### 4.5 Asisten AI

| ID | Kebutuhan | Prioritas | Status di Kode |
|----|-----------|-----------|----------------|
| F-46 | Tanya-jawab RAG dengan sitasi [n] | Tinggi | ✅ Terimplementasi — `POST /api/ask` |
| F-47 | Streaming chat dengan riwayat percakapan | Tinggi | ✅ Terimpleentasi — `POST //api/chat` (SSE) |
|F-48| Penarian vektor (cosin) dengan filter | Tinggi | ✅ Terimplementasi — `rag.ts` |
| F-49 | Deteksi pertanyaan perbandingan | Sedang | ✅ Terimplementasi — `isComprisonquery()` |
|F-50| Konteks perbandingan terstruktur1 | Sedang | ✅ Terimplementasi — `COMPARISON_SYSTEM_PROMPT` |
| F-51 | Sitasi per dokumen | Tingi |✅ Terimplementasi — `Citatio[]` |
| F-52 | Fallback LLM (DeeSeek → OpenAI) | Sedang |✅ Terimplementasi — steamaAnswer()` |
| F-53 | Simpan riwayat percakapan per user | Tinggi | ✅ Terimplementasi — `conversations`, `messags` |
| F-54 | Playgroud chat UI | Tinggi | ✅ Terimplementasi — `Playgound.tsx` |

**AlurRAG Quetion Answring:**
1. Pernaanyaan msuk via `POST api/ask` (Bearer token) atau `POST/api/chat` (session cookie)
2. `rag.serch()` dieksekusi:

   a. Jika `N8N_RAG_WEBHOOK_URL` di-set → panggil webhook n8n (timeout 30 detik)
   b. Jika gagal atau tidak ada → fallback ke search lokal:
      - Embed pertanyaan menja vector 1536d
      - Cari K chun teerik (default =1 8) via cosine similarity (`embedding <=> $1::vectr`3
      - Jika pertanyaan perbandingan: perluas pencarian + jamin tiap tahun dpat chunk
      - Bangun konteks (flat atau grup per dokumen

3. `enerateAnswe()` /`streamAnswe()` dipanggil:
   - Pilih system prompt (biasa atau perbandingan)
   - Panggil OpeAI (gpt-4o-mini) dengan fallback ke DeepSeek
   - Wajib merujuk sumer denan format [n]
  4. Ekstrk sasi yang dirujuk → map ke Citation[]
.5 Simpan ke usage_logs (question, answr, ited_chks, model, latency_ms)
  6. Utk chat: juga simpan ke tabl mesag `(cnveration_id, pole, cntent, ctations)`

**Feature Deteksi Perbandingan:**
- Regex detect: "erbandingan", "bandingkn", "dibandikan", "vs", "versus", "perbedaan", "selih"
- Juga triggered jka ada >= 2 tahun berbeda dalam pertanyan
- Efek: vector wide + cap per doc 5 + jamin tiap tahun dapatchunk → grup konteks per dokumen → tabel perbandingan

### 4.6 Dashboard Internal

| ID | Kebutuhan | Prioritas | Status di Kode |
|----|-----------|-----------|----------------|
| F-55 | Dashboard Early Warning (widget ringkasan) | Tinggi | ✅ Terimplementasi — `PortalDashboard.tsx` + `EarlyWarningWidget.tsx` |
| F-56 | Grafik tren sentimen 7 hari | Sedang | ✅ Terimplementasi |
| F-57 | Statistik hari ini (total, danger, warning) | Sedang | ✅ Terimplementasi |
| F-58 | Top PKPN clusters trending | Sedang | ✅ Terimplementasi |
| F-59 | Dashboard per slug (dinamis dari data) | Sedang | ✅ Terimplementasi — `PortalDashboard.tsx` |

### 4.7 Admin Panel

| ID | Kebutuhan | Prioritas | Status di Kode |
|----|-----------|-----------|----------------|
| F-60 | Manajemen pengguna (CRUD) | Tinggi | ✅ Terimplementasi — `GET/POST/PUT/DELETE /api/admin/users` |
| F-61 | Manajemen API token (buat, daftar, cabut) | Tinggi | ✅ Terimplementasi |
| F-62 | Manajemen konten publik (CRUD) | Tinggi | ✅ Terimplementasi — `GET/POST/PUT/DELETE /api/admin/content` |
| F-63 | Upload dokumen | Tinggi | ✅ Terimplementasi |
| F-64 | Daftar dokumen (termasuk status) | Tinggi | ✅ Terimplementasi — `GET /api/admin/documents` |
| F-65 | Retry dokumen gagal | Sedang | ✅ Terimplementasi |
| F-66 | Lihat log penggunaan API | Sedang | ✅ Terimplementasi — `GET /api/admin/usage-logs` |
| F-67 | Trigger crawl EWS manual | Tinggi | ✅ Terimplementasi |
| F-68 | Trigger crawl Pantau Berita manual | Tinggi | ✅ Terimplementasi |
| F-69 | Rich text editor untuk konten | Tinggi | ✅ Terimplementasi — `RichTextEditor.tsx` (TipTap) |

**Fitur Admin UI (dari `Admin.tsx`):**
- Tab kelola konten publik: tambah/edit/hapus berita & publikasi dengan rich text editor
- Tab manajemen user: tambah, edit, hapus user (dengan proteksi admin tidak bisa hapus akun sendiri)
- Tab API token: buat token per user, lihat daftar, cabut token
- Tab usage log: lihat log pertanyaan pengguna

### 4.8 Skills (AI Skills)

| ID | Kebutuhan | Prioritas | Status di Kode |
|----|-----------|-----------|----------------|
| F-70 | Generate PPTX dari teks/markdown | Sedang | ✅ Terimplementasi — `POST /api/skills/pptx` |

**Detail:**
- Input: `{ title, content }` (content dalam format markdown sederhana)
- Output: file PPTX yang bisa diunduh
- Fitur: judul slide dari heading`, bullet dari `- ` atau `1. `, slide pembuka, nomr slide
- Menggunakan pustaka pptxgenjs

### 4.9 Autentikasi dan Otirisasi

| ID | Kebutuhan | Prioritas| Statu di Kode |
|----|-----------|----------|----------------|
| F-71 | Login dengan email + password | Tinggi |✅ Teimpeentasi — `PO /api/auth/login` |
| F-72 | Sessioncookie + JWT token | Tinggi | ✅ Terimplementasi — `sess.onAuth.ts`, `token.th.ts` |
| F3 | Logout | Tingg | ✅Terimplementasi — `POST /api/aut/logut` |
| F4 | Cek sesi (whoami) | Tingg | ✅Terimplementasi — `GET /api/auth/me` |
| F-5 | Rate limit login | Sedng | ✅Terimplemetasi — `loginRateLimit.ts` |
| F-6 | Proteksi rute (requireLogin, requireAdmin) | Tingg |✅ Treelementasi — `sesionAuth.ts` |
|F-7| Autentisasi API token (Bearer) | Tinggi | ✅ Terimpleentasi — `tkenAuth.ts` |
| F-78 | Hash password (bcrypt) | Tinggi | ✅ Terimplementasi — `passwords.ts` |
| F-79 | Rate limit general | Sedang | ✅ Terimplementasi — `rateLimit.ts` |

**Mekanisme Autentikasi:**
1. **Session-based (cookie)**: Login menghasilkan cookie session ter-enkripsi + JWT token yang dikembalikan di response body
2. **Token-based (Bearer)**: API token dengan prefix `mih_` di-hash SHA256 dan disimpan di tabel `api_tokens`
3. **Rate limit**: Login rate limiter (configurable) untuk mencegah brute force

---

## 5. API Endpoints (Lengkap dari Kode)

### 5.1 Auth Routes (`/api/auth`)

| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| POST | `/api/auth/login` | Rate-limited | Login dengan email + password. Return `{ user, token }` + set cookie session |
| POST | `/api/auth/logout` | - | Hapus session cookie |
| GET | `/api/auth/me` | requireLogin | Ambil data user yang sedang login |

### 5.2 Ask Route (`/api/ask`)

| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| POST| `/api/ask` | Bearer token | RAG tanya-jawab. Return `{ anwer, ctations[] }`. Lo dicata ke `usage_logs` |

### 5.3 Chat Routes (`/api`)

| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| GET | `/api/conversations` | requireLogin | Daftar percakapan user (dengan message_count) |
| POST | `/api/conversations` | requireLogin | Buat percakapan baru |
| DELETE | `/api/conversations/:id` | requireLogin | Hapus percakapan (hanya milik sendiri) |
| GET | `/api/conversations/:id/messages` | requireLogin | Ambil pesan dalam percakapan |
| POST | `/api/chat` | Bearer token | Streaming chat via SSE. Auto-create conversation jika tidak ada `conversation_id` |

**SSE Event format (`/chat`):**
```
event: meta
data: {"conversation_id": 123}

event: delta
data: {"text": "Berdasarkan dokumen..."}

event: citations
data: {"citations": [{"label": 1, "documen_id": 5, ...}]}

event: done
ata: {}
```

### 5.4 Content Routes (Public, `/api/content`)

| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| GET | `/api/content` | Public | Semua konten published (berita & publikasi), diurut date DESC |
| GET | `/api/content/:slug` | Public | Detail konten by slug (404 jika tidak ditemukan) |

### 5.5 Early Warning Routes (`/api/early-warning`)

| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| GET | `/api/early-warning` | requireLogin | Daftar artikel dengan filter: sumber, sentimen, alert, q (pencarian ILIKE). Pagination 20/page. Return `{ data, meta }` |
| GET | `/api/early-warning/summary` | requireLogin | Widget data: top 5 alerts, tren 7 hari, stat hari ini, top PKPN clusters |
| POST | `api/early-warning/crawl` | requireAdmn | Toor rail 8 RSS eed. Retur`{ sccess, ew_articles, errors }` |

**Parameter filter GET /api/early-warning:**
- `sumber` → filter sumbe (cnbc, katdata, antara,...)
- `sentimen` → filter setimen (positif, negtif, netral)
- `alert=true` → hyang is_alert = true
- `q` → pencarian judl (LIKE)
- `page` → halaman (default 1)
- `limit` → batas per haaman (default 20, max 100)

### 5.6 Pantau Berita PKPN Routes (`/api/pantau-berita`)

| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| GET | `/api/pantau-berita/ringkasan-klaster` | equireLogin | Ringkasan per klaster PKN (-8): jumlah, breakdawn positi/negatif, rata relevansi|
| GET | `/api.pantau-berita/tren` | requireLogin | Tren mingguan: er hari, tota, raa relevansi, breakdownampak |
| GET | `/api/pantau-berita/berita` | eqireLogin | Daftar berita dengan filter (dampak, minRel, klaster, perlu_review, q, sumber). Pagination. Return `{ data, et }` |
| GET | `/api/pantau-berita/program` | requireLogin | Daftar program PKPN per klaster (1-8), dengan jumlah artikel, rata relevansi, positif/negatif, terakhir update |
| GET | `/api/pantau-berita/antrean-review` | requireLogin | Artikel dengan `perlu_review_manual = true`, lengkap data review count |
| POST | `/api/pantau-berita/review` | requireAdmin | Subm review manual: `{ rticle_id, relevans, dapak, kaster_pkn, caatan }`. Update status jasi 'diriw'|
| POST| `/api/pantau-berita/crawl` | requireAdmin| Crowl R ped ke `articles` + `aticle_cores` dengan plasm scoring 3-axis |

**Parameter filter GET /api/pantau-berita/berita:**
- `d paka` → filter dampak (positif, negaif, netral, dak_ad)
| `minRel` → filter relevansi minimal 0-3 (default 0)
| `klaster` → filter klaster PKPN 1-8
- `perlu_review=true` → hanya yang perlu review manual
- `q` → pencarian judul (ILIKE)
- `sumber` → filter sumber (cnbc, katadata, ...)
- `page` → halaman (default 1)
- `limit` → batas per halaman (default 20, max 100)

### 5.7 Documents Routes (`/api/documents`)

| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| GET | `/api/documents/:id/file` | requireLogin | Download file mentah dokumen. Set Content-Disposition dengan RFC 5987 |
| GET | `/api/documents/graph` | requireLogin | Graph relasi dokumen: cosine antar centroid + co-citation. Query param: `min_semantic` (default 0.5) |

**Detail Graph Document:**
- **Nodes**: dokumen dengan status='completed' yang punya chunk aktif (is_outdated=FALSE)
- **Edges**: dua jenis:
  1. **Semantic**: cosine similarity antar centroid embedding per dokumen. Hanya top 5 per dokumen (kiri & kanan). Filter `>= min_semantic`
  2. **Citation**: dari `messages.citations` dan `usage_logs.cited_chunks` (ko-kutipan)
- **Cluster**: klasifikasi tematik per dokumen berdasarkan filename (bobot x3) + sample chunk → 7 klaster (6 tematik + Lainnya)
- **cluster_edges**: agregasi edge ke level klaster

### 5.8 Skills Route (`/api/skills`)

| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| POST | `/api/skills/pptx` | requireLogin | Generate PPTX dari teks. Input: `{ title, content }`. Output: file PPTX |

### 5.9 Admin Routes (`/api/admin`)

| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| GET | `/api/admin/users` | requireAdmin | Daftar semua user |
| POST | `/api/admin/users` | requireAdmin | Buat user baru. Input: `{ name, email, unit_kerja, password, is_admin }` |
| PUT | `/api/admin/users/:id` | requireAdmin | Update user. Proteksi: admin tidak bisa mencabut admin sendiri |
| DELETE | `/api/admin/users/:id` | requireAdmin | Hapus user. Proteksi: tidak bisa hapus akun sendiri |
| POST | `/api/admin/users/:id/tokens` | requireAdmin | Buat API token untuk user. Return token sekali. Input: `{ name, scope, daily_limit, expires_at }` |
| GET | `/api/admin/tokens` | requireAdmin | Daftar semua API token (join dengan users) |
| POST | `/api/admin/tokens/:id/revoke` | requireAdmin | Cabut token (set revoked_at = now()) |
| GET | `/api/admin/usage-logs` | requireAdmin | 200 log terakhir (id, created_at, question, latency_ms, token_name) |
| GET | `/api/admin/documents` | requireLogin | Daftar dokumen (id, filename, file_type, status, dll.) |
| POST | `/api/admin/documents` | requireLogin | Upload dokumen. Multipart: file + file_type (opsional). Ekstensi: pptx, pdf, docx. Max 50MB |
| POST | `/api/admin/documents/:id/retry` | requireLogin | Retry dokumen failed → pending. Hanya untuk status='failed' |
| GET | `/api/admin/content` | requireAdmin | Semua konten (termasuk unpublished) |
| POST | `/api/admin/content` | requireAdmin | Buat konten baru (news/publication). Input: type, slug, title, excerpt, image, category, author, date, content, document_url, document_name, gallery[], is_published |
| PUT | `/api/admin/content/:id` | requireAdmin | Update konten. Patch operations. |
| DELETE | `/api/admin/content/:id` | requireAdmin | Hapus konten |

### 5.10 Health Route

| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| GET | `/health` | Public | Health check. Return `{ ok: true }` |

### 5.11 Worker HTTP API (Port 3200)

| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| GET | `/api/health` | Public | Status worker. Return `{ status, uptime, pending }` |
| GET | `/api/documents/status` | Public | Status dokumen: pending, completed, failed, total |
| POST | `/api/documents/:id/retry` | Public | Reset dokumen failed → pending |
| POST | `/api/documents/retry-all` | Public | Reset semua dokumen failed → pending |

---

## 6. Skema Database (Dari Migration SQL)

### 6.1 `documents` — Metadata file dokumen

```sql
CREATE TABLE documents (
  id             BIGSERIAL PRIMARY KEY,
  filename       TEXT NOT NULL,
  file_type      TEXT NOT NULL,             -- 'paparan' | 'laporan' | 'lainnya'
  file_extension TEXT NOT NULL,             -- 'pptx' | 'pdf' | 'docx'
  sha256         TEXT NOT NULL UNIQUE,      -- hash SHA256 file untuk dedup
  file_path      TEXT NOT NULL,             -- path di disk (/data/uploaded/ atau /data/raw/)
  status         TEXT NOT NULL DEFAULT 'pending',  -- pending | processing | completed | failed
  error_message  TEXT,
  chunk_count    INT NOT NULL DEFAULT 0,
  source         TEXT NOT NULL DEFAULT 'upload',   -- 'upload' | 'drive' | 'sharepoint'
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX documents_source_idx ON documents (source);
```

### 6.2 `chunks` — Chunk teks dengan vector embedding

```sql
CREATE TABLE chunks (
  id            BIGSERIAL PRIMARY KEY,
  document_id   BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  content       TEXT NOT NULL,
  embedding     vector(1536),               -- OpenAI text-embedding-3-small
  page_or_slide INT,                        -- nomor halaman/slide asal
  section_title TEXT,                       -- judul bagian asal
  chunk_index   INT NOT NULL,
  is_outdated   BOOLEAN NOT NULL DEFAULT FALSE,  -- true jika digantikan versi baru
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX chunks_embedding_idx ON chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX chunks_document_id_idx ON chunks (document_id);
CREATE INDEX chunks_is_outdated_idx ON hunks (is_oudated);
```

### 6.3 `users` — Pengguna sistema

```sql
CREATE TABLE users (
  id            BIGSERIAL PRMARY KEY,
  nama         TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  unit_kerja    TEXT NOT NULL,              -- contoh: "Subbid. Makro", "Bagian Ortala"
  password_hash TEXT NOT NULL,              -- bcrypt hash
  is_admin      BOOLEAN NOT NULL DEFAULT FASE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 6.4 `api_tokens` — Toke API

```sql
CREATE TABLE api_tokens (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL DEFAULT 'defaut',
  token_hash   TEXT NOT NULL UNIQUE,        -- SHA256 ari token mentah (`mih_...`)|
  scope        TEXT NOT NULL DEFAULT 'inernal-read',-- scope akses
  daily_limit  INT NOT NULL DEFAULT 100,      -- bat as per hari
  expires_at   TIMESTAMPTZ,                     -- kadaluarsa
  revoked_at   TIMESTAMPTZ,                    -- dicabut secara manual
  last_used_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 6.5 `usage_logs` — Log penggunaan API

```sql
CREATE TABLE usage_logs (
  id           BIGSERIAL PRIMARY KEY,
  token_id     BIGINT REFERENCES api_tokens(id) ON DELETE CASCADE,
  user_id      BIGINT NOT NULL REFERENCES users(id),
  question     TEXT NOT NULL,                -- pertanyaan user
  answer       TEXT NOT NULL,                -- jawaban AI
  cited_chunks JSONB NOT NULL DEFAULT '[]', -- daftar chunk yang dirujuk
  model        TEXT,                         -- model AI yang digunakan
  latency_ms   INT,                          -- waktu respons dalam ms
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX usage_logs_token_created_idx ON usage_logs (token_id, created_at);
```

### 6.6 `content` — Konten publik (berita & publikasi)

```sql
CREATE TABLE content (
  id            SERIAL PRIMARY KEY,
  type          TEXT NOT NULL CHEC (type IN ('news','publication')),-- jenis: erita/ublikasi
  slug          TEXT NOT NULL UNIQUE,          -- URL slug
  title         TEXT NOT NULL,                 -- judul
  excerpt       TEXT NOT NULL DEFAULT '',       -- ingkasan
  image         TEXT NOT NULL DEFAULT '',       -- URL gambar
  category      TEXT NOT NULL DEFAULT '',       -- kategor konten
  author         TEXT NOT NULL DEFAULT '',       -- penulis
  date           TEXT NOT NULL DEFAULT '',      -- tanggal (string, format YYYY-MM-DD)
  content       TEXT NOT NULL DEFAULT '',       -- isi konten (HTML)
  document_url  TEXT NOT NULL DEFAULT '',       -- URL dokumen terkait
  document_name TEXT NOT NULL DEFAULT '',       -- nama dokumen terkait
  gallery       TEXT[] NOT NULL DEFAULT '{}',   -- array URL gambar galeri
  is_published  BOOLEAN NOT NULL DEFAULT true, -- status publikasi
  created_by    INT REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX content_type_published_idx ON content (type, is_published, date DESC);
```

### 6.7 `conversations` — Percakapan chat

```sql
CREATE TABLE conversations (
  id         SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL DEFAULT '',       -- auto-generated dari pertanyaan pertama (max 50 chars)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 6.8 `messages` — Pesan dalam percakapan

```sql
CREATE TABLE messages (
  id              SERIAL PRIMARY KEY,
  conversation_id INT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,role              TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content         TEXT NOT NULL,
  citations       JSONB NOT NULL DEFAULT '[]',  -- daftar { document_id, filename, ... }
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX messages_conversation_idx ON messages (conversation_id, created_at);
```

### 6 9 `early_warnings` — Hasil crawlin (EWS)

```sql
CREATE TABLE early_warnings (
  id               SERIL PRIMARY KEY,
  judul            VARCHR(500) NOT NULL,
  sumber           VARCHAR(100) NOT NUL,      -- cnbc | katadata | antara | tempo-bisnis | tempo-nasional | liputan6
  url              TEXT NOT NULL UNIQUE,
  konten           TEXT,
  published_at     TIMESTAMP,
  fetched_at       TIMESTAMP DEFAULT NOW(),
  keyword          VARCHAR(100),              -- topik terdeteksi (e.g., "inflasi", "APBN")
  sentimen         VARCHAR(20) DEFAULT 'netral',  -- positif | negatif | netral
  sentimen_score   DECIMAL(4,3),              -- -1.000 s.d +1.000
  confidence       VARCHAR(10) DEFAULT 'high',    -- high | medium | low
  ringkasan        TEXT,                      -- AI-generated (1-2 kalimat)
  lex_score        DECIMAL(4,3),              -- raw score dari lexicon (untuk audit)
  llm_score        DECIMAL(4,3),              -- score dari LLM (null jika tidak dipanggil)
  is_alert         BOOLEAN DEFAULT FALSE,
  alert_level      VARCHAR(10) DEFAULT 'info',    -- info | warning | danger
  pkpn_clusters    INTEGER[] DEFAULT '{}',    -- array klaster PKPN terdeteksi (1-8)
  pkpn_score       INTEGER DEFAULT 0,         -- skor relevansi PKPN 0-3
  pkpn_literal     BOOLEAN DEFAULT false,     -- true jika teks menyebut "PKPN" literal
  created_at       TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_early_warnings_sentimen ON early_warnings(sentimen);
CREATE INDEX idx_early_warnings_alert ON early_warnings(is_alert);
CREATE INDEX idx_early_warnings_fetched ON early_warnings(fetched_at DESC);
CREATE INDEX dx_early_warnings_sumber ON early_arnings(sumber);
CREAT INDEX idx_earlywarnings_pkn_cor ON early_warnings(pkn_score);
```

### 6.10 `articles` — Arikel Panta erita PKPN

```sql
CREATE TABE articles (
  id            BIGSERIAL PRMARY KEY,
  url           TEXT NOT NULL UNIQUE,
  url_hash      TEXT NOT NULL,               -- SHA256 URL untuk dedup cepat
  content_hash  TEXT NOT NULL,               -- SHA256 konten untuk deteksi duplikat konten
  sumber        TEXT NOT NULL,
  judul         TEXT NOT NULL,
  isi           TEXT NOT NULL,               -- konten lengkap
  ringkasan     TEXT,                        -- cuplikan 300 karakter
  bahasa        TEXT DEFAULT 'id',
  terbit_at     TIMESTAMPTZ NOT NULL,
  diambil_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_articles_terbit_at ON articles (terbit_at DESC);
CREATE INDEX idx_articles_content_hash ON articles (content_hash);
```

### 6.11 `article_scores` — Skor 3-axis per artikel

```sql
CREATE TABLE article_scores (
  id                  BIGSERIAL PRIMARY KEY,
  article_id          BIGINT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  model               TEXT NOT NULL,
  prompt_version      TEXT NOT NULL DEFAULT 'v1',
  relevansi_llm       SMALLINT NOT NULL CHECK (relevansi_lm BETWEEN 0 AND 3),
  relevansi_final     SMALLINT NOT NULL CHECK (relevansi_final BETWEEN 0 AND 3),
  lantai_diterapkan   BOOLEAN NOT NULL DEFAULT false,
  dampak              TEXT NOT NULL CHECK (dampak IN ('positif','negatif','netral','tidak_ada')),
  sentimen_teks      TEXT NOT NULL CHE (sentimen_teks IN ('ositif','negatif','netral')),
  klaster_pkn         SMALLINT[] NOT NULL DEFAULT '{}',
  topik               TEXT,
  alasan              TEXT,
  keyword_highlight   JSONB NOT NULL DEFAULT '[]',  -- [{ kta: "...", ktegori: "..." }, ...]
  lexicon_score       REAL,
  confidence          REAL,
  perlu_review_manual BOOLEAN NOT NULL DEFAULT false,
  status              TEXT NOT NULL DEFAULT 'ok',    -- ok | direview
  dibuat_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (article_id, model, prompt_version)        -- satu skor per model per versi prompt
);

CREATE INDEX idx_article_scores_klaster ON article_scores USING GIN (klaster_pkpn);
CREATE INDEX idx_article_scores_perlu_review ON article_scores (perlu_review_manual) WHERE perlu_review_manual;
```

### 6.12 `reviews` — Review manual artikel

```sql
CREATE TABLE reviews (
  id           BIGSERIAL PRIMARY KEY,
  article_id   BIGINT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  reviewer     TEXT NOT NULL,                  -- email reviewer
  relevansi    SMALLINT CHEC (relevansi BETWEEN 0 AND 3),  -- override
  dampak       TEXT CHECK (dampak IN ('positif','negatif','netral','tidak_ada')),  -- override
  klaster_pkpn SMALLINT[],                     -- override klaster
  catatan      TEXT,                            -- catatan reviewer
  dibuat_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 7. Model Data

Berikut ringkasan entitas data berdasarkan tabel database yang ada:

| Entitas | Tabel | Deskripsi |
|---------|-------|-----------|
| **Dokumen** | `documents` | File yang diupload/disinkronisasi untuk RAG. Punya status lifecycle: pending → processing → completed/failed |
| **Chunk** | `chunks` | Segmen teks dari dokumen dengan vector embedding 1536d. Bisa ditandai outdated jika ada versi baru |
| **Pengguna** | `users` | Akun pengguna internal dengan role admin/non-admin |
| **API Token** | `api_tokens` | Token akses programmatic dengan scope, daily limit, expiry |
| **Log Penggunaan** | `usage_logs` | Catatan setiap pertanyaan RAG + jawaban + sitasi |
| **Konten** | `content` | Berita dan publikasi untuk portal publik dengan tipe 'news'/'publication' |
| **Percakapan** | `conversations` | Grup pesan chat per user |
| **Pesan** | `messages` | Pesan user/asisten dalam percakapan dengan sitasi |
| **Early Warning** | `early_warnings` | Artikel hasil crawl RSS dengan skor sentimen dan alert level |
| **Artikel PKPN** | `articles` | Artikel hasil crawl RSS untuk Pantau Berita PKPN |
| **Skor Artikel** | `article_scores` | Skor 3-axis (relevansi, dampak, sentimen teks) per artikel |
| **Review** | `reviews` | Review manual terhadap skor artikel |

---

## 8. Arsitektur Sistem

### 8.1 Deployment Architecture

```
                   ┌─────── INTERNET ───────┐
                   │                         │
                   ▼                         ▼
           ┌──────────────┐       ┌──────────────────┐
           │   Browser    │       │  API Client       │
           │  (React SPA) │       │  (curl, n8n, dll) │
           └──────┬───────┘       └────────┬─────────┘
                  │                        │
                  │ HTTP/HTTPS             │ Bearer Token
                  ▼                        ▼
           ┌────────────────────────────────────┐
           │         NGINX (Reverse Proxy)       │
           │  ┌──────────────┐  ┌────────────┐  │
           │  │ Static SPA   │  │ API Proxy  │  │
           │  │ (dist/)      │  │ → :3000    │  │
           │  └──────────────┘  └────────────┘  │
           └────────────────────────────────────┘
                              │
                              ▼
           ┌────────────────────────────────────┐
           │    BACKEND (Bun) port 3000          │
           │    Express.js + pg + OpenAI SDK     │
           │    Routes: ask, chat, auth, admin,  │
           │    content, early-warning, pantau-  │
           │    berita, documents, skills        │
           └──────────┬──────┬──────┬──────┬────┘
                      │     │      │      │
                      ▼     ▼      ▼      ▼
           ┌────────┐ ┌─────┐┌─────┐┌─────┐┌──────┐
           │Postgre│ │OpenAI││DeepSeek│nn8 RAG││icio│
           │ +     │ │ &    ││(fallback││Webhook││n8n│
           │vector │ │Embed ││chat)   ││(ops)  ││   │
           └───────┘ └─────┘└────────┘└───────┘└─────┘

           ┌────────────────────────────────────┐
           │    WORKER (Python) port 3200        │
           │    /data/raw/ → parse → chunk →    │
           │    embed → DB. Juga: rclone sync    │
           │    (Google Drive / SharePoint)      │
           └────────────────────────────────────┘

           ┌────────────────────────────────────┐
           │    MICROSERVICES (Docker)           │
           │  ┌────────┐┌────────┐┌────────┐    │
           │  │Crawler ││Analisis││Artikel │    │
           │  │Service ││Service ││Service │    │
           │  └────────┘└────────┘└────────┘    │
           │  (masing-masing adauth + DB)     │
           └────────────────────────────────────┘
```

### 8.2 Konfigurasi Lingkungan (dari `.env.example`)

| Variabel | Default | Deskripsi |
|----------|---------|-----------|
| `DATABASE_URL` | `postgres://mih:***@localhost:5432/mih` | Koneksi PostgreSQL |
| `SESSION_SECRET` | (wajib, min 32 chars) | Secret untuk session cookie |
| `JWT_SECRET` | (opsional, fallback ke SESSION_SECRET) | Secret untuk JWT |
| `OPENAI_API_KEY` | (wajib untuk produksi) | API key OpenAI |
| `OPENAI_MODEL` | `gpt-4o-mini` | Model utama untuk RAG |
| `FALLBACK_API_KEY` | - | API key fallback (DeepSeek) |
| `FALLBACK_MODEL` | `deepseek-chat` | Model fallback |
| `FALLBACK_BASE_URL` | `https://api.deepseek.com/v1` | Base URL fallback |
| `COMPARISON_MODEL` | `gpt-4o` | Model untuk pertanyaan perbandingan |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | Model embedding |
| `EMBEDDING_DM` | `1536` | Dimension vektr |
| `ORT` | `3000` | Port bakend |
| `DATA_R` | `/data` | Directoy data file |
| `VECTOR_K` | `8` | Jumlah chunk top-K untuk konteks RAG |
| `CHAT_HISTORY_TURNS` | `8` | Jumlah turn ercakapan dalam riwayat |
| `N8N_AG_WEBHOOK_URL` | - | Webhook n8n ita dari Advced |RAG|
| `L_OROVIDER` | `openai` | Provider LLM (penai | mok) |
| `RNTE_OENAI_KE` | - | OenAI KE untu woker embedding |
| `RAW_DIR` | `/data/raw` | Direktori raw file (worker) |
| `RIVE_CONFI | - | Path ke rclone.conf |
| `DRIVE_REMOTE` | - | Remote name Google Drive (rclone) |
| `DRIVE_DEST` | `/data/raw/drive` | Direktori sync Drive |
| `SHAREPOINT_REMOTE` | - | Remote name SharePoint (rclone) |
| `SHAREPOI eST` | `/data/raw/sharepoint` | Direktriync harePoint |
| `INGEST_NTERVAL_SE` |30` | Poling interval r worker |
| `DRVE_SYNC_NTERAL_MI` | 5` | Sync iterval rive |
| `OC_ENABLED` | `1`  | Tesseract OR untuk PDF |

### 8.3 Docker Compose Services (dari `docker-compose.yml`)

1. **db**: pgvector/pgvector:pg16
2. **backend**: Bun aplikasi (build dari ./backend)
3. **worker**: Python 3.12-slim (build dari ./worker)
4. **frontend**: Nginx (build dari ./frontend)

Juga ada service terpisah:
5. **crawler**: microservice RSS crawler
6. **analisis**: microservice analisis sentimen
7. **artikel**: microservice manajemen artikel

Volume:
- `db_data` → data PostgreSQL
- `./data:/data` → shared file storage (upload + raw + rclone)

---

## 9. Kebutuhan Non-Fungsional

### 9.1 Keamanan

| ID | Kebutuhan | Status di Kode |
|----|-----------|----------------|
| N-01 | Password di-hash dengan bcrypt | ✅ Terimplementasi — `passwords.ts` |
| N-02 | Session cookie terenkripsi | ✅ Terimplementasi — `session.ts` |
| N-03 | JWT untuk API autentikasi | ✅ Terimplementasi — `jwt.ts` |
| N-04 | Token API di-hash SHA256 | ✅ Terimplementasi — `token.ts` |
| N-05 | Rate limit login (configurable) | ✅ Terimplementasi — `loginRateLimit.ts` |
| N-06 | Proteksi route (requireLogin, requireAdmin) | ✅ Terimplementasi — `sessonAuth.ts` |
| N-07 | Cek kepemilikan resource (conversation milik sendiri) | ✅ Terimplementasi |
| N-08| Validasi input (type enu, integer check, lengthimit) | ✅ Terimplementasi |
| N-09 | Cegah admin cabut admin sendiri | ✅ Terimplementasi |
| N-10| Cegah admn hapu akun endri | ✅ Terimplemntasi |
| N-11| File upload hnya ekstensi tertentu | ✅ Terimplementasi |
| N-12 | CORS + Helmet (belum optimization) | ✅ Terpersiapkan di package.jon |

### 9.2 Kinerja

| ID | Kebutuhan | Status di Kode |
|----|-----------|----------------|
| N-13 | Pagination semua endpoint list | ✅ Terimplementasi (dengan default 20/page, max 100) |
| N-14 | SSE streaming untuk chat | ✅ Terimplementasi (`/api/chat` with Content-Type: text/event-stream) |
| N-15 | Connection keep-alive + X-Accel-Buffering: no | ✅ Terimplementasi |
| N-16 | Batch processing worker (limit 10 per siklus) | ✅ Terimplementasi |
| N-17 | HNSW vector index untuk cosine search | ✅ Terimplementasi |
| N-18 | Upload file max 50MB | ✅ Terimplementasi |
| N-19 | JSON body limit 1MB | ✅ Terimplementasi |
| N-20 | RSS crawl timeout 15s per feed | ✅ Terimplementasi |
| N-21 | RAG webhook timeout 30s | ✅ Terimplementasi |
| N-22 | Fallback provider (OpenAI → DeepSeek) | ✅ Terimplementasi |

### 9.3 Reliabilitas

| ID | Kebutuhan | Status di Kode |
|----|-----------|----------------|
| N-23 | Error boundary Express (global handler) | ✅ Terimplementasi |
| N-24 | Worker: FOR UPDATE SKIP LOCKED (anti double-process) | ✅ Terimplementasi |
| N-25 | Worker: commit per dokumen (rollback on fail) | ✅ Terimplementasi |
| N-26 | Database health check di docker-compose | ✅ Terimplementasi |
| N-27 | Worker health check via HTTP port 3200 | ✅ Terimplementasi |

### 9.4 Maintainability

| ID | Kebutuhan | Status di Kode |
|----|-----------|----------------|
| N-28 | Migration SQL idempoten | ✅ Terimplementasi |
| N-29 | Seed script untuk admin awal | ✅ Terimplementasi — `backend/scripts/seed.ts` |
| N-30 | Smoke test | ✅ Terimplementasi — `backend/scripts/smoke.ts` |
| N-31 | Test suite (Bun test) | ✅ Terimplementasi — berbagai file test di `backend/tests/` |
| N-32 | Test worker (pytest) | ✅ Terimplementasi — `orker/tests/` |
| N-33 | CI/CD pipeline (Gitu) | ✅ Terimplementasi — `github/orkflos/ci.ml` |

### 9.5 Portability

| ID | Kebutuhan | Status di Kode |
|----|-----------|----------------|
| N-34 Docker container untuksemua komponen | ✅ Terimplementasi |
| N-35 | One-line deploy via dockr-compose | ✅ Terimplementasi |
| N-36 Environmentnfigurasi via env variabel | ✅ Terimplementasi |
| N-37 | Frontend static via Nginx multi-stage build | ✅ Terimplementasi |

---

## 10. Integrasi

### 10.1 OpenAI / LLM API

| Kompon | Tujuan | ID Kunci |Detil |
|---------|----------|----------|------|
| RAG Question Answring | GPT-opai | `OPENAI_API_KEY` | Model `gpt-4o-mini` (default). Musiman: tot-embedding-3-small untuk emeddng |
| Fallback chat | DeepSeek Chat | `ALLBACK_PI_KEY` | Model `deepseek-chat` (defaut). Falsback urutan ke-2 dalam `streamAnswer()` |
| Compaison query | GPT-4omparison | Sama denan OPENAI_API_KEY | Modl `gpt-4o` untuk perandingan (comparisonModel) |
| Embedding worker | OpeAI Embed | `WORKER_OPENAI_KEY` | Model ext-embedding-3-smal, diksi batch 64 |
| Tikoken | OpenA tokenizer | Tikoken cace|cl000_baseuntuk hitung token |

### 10.2 n8n RAG Webhook (Opsional)

Jika `N8N_RAG_WEBHOOK_URL` di-set, backend akan memanggil webhook n8n untuk retrieval sebelum fallback ke search lokal.

**Request:**
```json
{
  "question": "Apa target pembangunan makro?",
  "vector_k": 8
}
```

**Response (harus):**
```json
{
  "labeled": [
    { "label": 1, "document_id": 5, "filename": "RKP 2026.pdf", "file_type": "pdf", "page_or_slide": 10, "section_title": "Pendahuluan", "content": "..." }
  ],
  "context": "string"
}
```

### 10.3 rclone (Google Drive & SharePoint)

| Sumber | Env | Deskripsi |
|--------|-----|-----------|
| Google Drive | `DRIVE_REMOTE`, `RCLONE_CONFIG`, `DRIVE_DEST` | Sync dokumen dari Drive ke `/data/raw/drive/` |
| SharePoint | `SHAREPOINT_REMOTE`, `RCLONE_CONFIG`, `SHAREPOINT_DEST` | Sync dokumen dari SharePoint ke `/data/raw/sharepoint/` |

**Cara kerja:**
1. Worker watch() loop tiap 15 menit panggil `drive_sync()` / `sharepoint_sync()`
2. rclone sync dari remote → lokal direktori (hanya *.pdf, *.pptx, *.docx)
3. scan_dir() detect file baru → insert ke documents denan source ='derve' atau 'sharepoint
4. Dokumen diproses ecara ormal leh pipeline inget
5. prune_removed() hapu dokemen dari DB jika file ndah tidak di di disk

### 10.4 PostgreSQL + pgvector

| Kompon | Detil |
|---------|-------|
| Database | PostgreSQL 16 |
| Extensi | pgecor1536) — HNSW index untuk cosin simarity |
| Koneksi | Melalui `DATABASE_URL` env |
| Pool | singeloton pool di `backend/src/db.ts` |

---

## Lampiran A: Teknologi Stack

**Backend:**
- Runtime: Bun (JavaScript/TypeScript)
- Framework: Express.js
- Database: pg (PostgreSQL client)
- AI: openai SDK, tiktoken
- Upload: multer
- Auth: jsonwebtoken, bcryptjs

**Frontend:**
- Framework: React 18
- Bundler: Vite
- Routing: React Router DOM 6
- UI: FluentUI React Components, Tailwind CSS
- Rich Text: TipTap/ProseMirror

**Worker:**
- Runtime: Python 3.12
- Database: psycopg[binary]
- Parsers: pypdf (PDF), python-docx (DOCX), python-pptx (PPTX)
- OCR: pytesseract (tesseract-ocr-ind + eng)
- AI: openai SDK, tiktoken
- Sync: rclone (apt)
- Rg: reportlab

**DevOps:**
- Container: Docker & Docker Compose
- CI: GitHub Actions (CI + Deploy)
- Deploy: Self-hosted runner ke server Arthakarya (10.2.17.123)

## Lampiran B: Stuktur Direktori yang Terealisasi

```
mih/
├── backend/
│   ├── src/
│   │   ├── lib/           # highlight, jwt, lexicon, llm-sentiment, passwords, session, token, rateLimit
│   │   ├── middleware/     # sessionAuth, tokenAuth
│   │   ├── prompts/       # scoring.v1.md
│   │   ├── routes/        # admin, ask, auth, chat, content, documents, early-warning, pantau-berita, skills
│   │   ├── services/      # berita-scorer, clusters, embeddings, llm, rag
│   │   ├── app.ts, config.ts, db.ts, index.ts, types.ts
│   │   └── ...
│   ├── scripts/           # seed, seed-content, smoke
│   ├── tests/             # 14 file test
│   └── services/          # 3 microservices (crawler, analisis, artikel)
├── frontend/
│   ├── src/
│   │   ├── components/    # ui, RichTextEditor, EarlyWarningWidget
│   │   ├── pages/         # Admin, Documents, DocumentGraph, Login, Playground
│   │   ├── pages/portal/  # 10 halaman portal
│   │   └── api.ts, App.tsx, App.css, portal.css, index.css
│   └── ...
├── worker/
│   ├── parsers/           # base, pdf, docx, pptx
│   ├── scripts/           # make_samples
│   ├── tests/             # 7 file test
│   └── api.py, chunking.py, db.py, embedding.py, ingest.py
├── db/
│   ├── init.sql           # Schema awal (12 tabel)
│   └── migrations/        # 4 migration file
├── deploy/vps/            # nginx-mih.conf.example
├── docs/                  # Dokumentasi, spec, plan
├── n8n/                   # rag-retrieval.json workflow
├── scripts/               # deploy scripts
├── docker-compose.yml
├── docker-compose.prod.yml
└── .env.example
```

---

## Keterangan Dokumen

| Metadata | |
|----------|---|
| **Dokumen** | Software Requirements Specification |
| **Sistem** | Macro Intelligence Hub (MIH) |
| **Berdasarkan** | Analisis kode sumber di `/tmp/mih-repomix.md` (26.337 baris, 925KB) |
| **Akurasi** | Setiap fitur, endpoint, tabel database, dan komponen diverifikasi dari kode yang SESUNGGUHNYA ada |
| **Tanggal** | 23 September 2026 |
| **Bahasa** | Indonesia |