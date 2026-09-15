# 🛰️ Early Warning System — MIH Platform

> **Module:** Portal Dashboard — MIH (`mih.keuanganppn1.cloud`)
> **Status:** Planned
> **Author:** Hadid / Arya
> **Last Updated:** 2026-09-15

---

## 1. Overview

Early Warning System adalah modul monitoring berita & sentimen ekonomi yang berjalan di dashboard MIH. Sistem mengambil artikel dari 6 portal berita Indonesia, menganalisis sentimen menggunakan metodologi **Hybrid Lexicon + LLM**, dan menampilkan peringatan dini berupa alert cards di dashboard.

### Tujuan

- Mendeteksi berita negatif yang berpotensi berdampak pada perencanaan & anggaran
- Memberikan gambaran sentimen ekonomi secara real-time (update tiap 6 jam)
- Menjadi early warning sebelum risiko masuk ke data monitoring formal

### Target User

| Role | Kebutuhan |
|---|---|
| Direktur / Sekretaris | Melihat ringkasan alert & tren sentimen di dashboard utama |
| Operator / Staf | Menelusuri detail berita, filter by sumber/sentimen |
| Admin | Trigger crawl manual, maintain kamus sentimen |

---

## 2. Architecture

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  6 RSS Feed  │ →  │   Crawler    │ →  │  PostgreSQL  │ →  │   REST API   │
│ (cron 6 jam) │    │  (Node/Bun)  │    │ (1 tabel)    │    │  /api/early- │
│              │    │  + LLM       │    │              │    │  warning/*   │
└──────────────┘    └──────────────┘    └──────────────┘    └──────┬───────┘
                          │                                        │
                     ┌────┴────┐                                   │
                     │ Lexicon │                                   │
                     │ (100+   │                                   │
                     │  kata)  │                                   │
                     └─────────┘                                   │
                                                             ┌─────┴──────┐
                                                             │  Frontend  │
                                                             │  (React)   │
                                                             │  Widget +  │
                                                             │  Halaman   │
                                                             └────────────┘
```

### RSS Sources (aktif)

| Portal | URL | Format |
|---|---|---|
| CNBC Indonesia | `https://www.cnbcindonesia.com/rss` | RSS 2.0 |
| Katadata | `https://katadata.co.id/rss` | RSS 2.0 |
| Antara Ekonomi | `https://www.antaranews.com/rss/ekonomi` | RSS 2.0 |
| Tempo Bisnis | `https://rss.tempo.co/bisnis` | RSS 2.0 |
| Tempo Nasional | `https://rss.tempo.co/nasional` | RSS 2.0 |
| Liputan6 Bisnis | `https://feed.liputan6.com/rss/bisnis` | RSS 2.0 |

### Stack

| Layer | Teknologi |
|---|---|
| Backend | Bun + Express + TypeScript (MIH existing) |
| Database | PostgreSQL 16 (MIH existing) |
| LLM | DeepSeek v4 flash via OpenRouter (existing `OPENROUTER_API_KEY`) |
| Frontend | React 18 + Vite + TypeScript (MIH existing) |
| Cron | Hermes `cronjob` tool (interval 6 jam) |

---

## 3. Database

### Tabel: `early_warnings`

```sql
-- Migration: backend/src/db/migrations/011_early_warnings.sql

CREATE TABLE early_warnings (
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

CREATE INDEX idx_early_warnings_sentimen ON early_warnings(sentimen);
CREATE INDEX idx_early_warnings_alert ON early_warnings(is_alert);
CREATE INDEX idx_early_warnings_fetched ON early_warnings(fetched_at DESC);
CREATE INDEX idx_early_warnings_sumber ON early_warnings(sumber);
```

---

## 4. Sentiment Methodology — Hybrid Lexicon + LLM

### 4.1 Lexicon Base

Kamus sentimen spesifik konteks ekonomi Indonesia:

**Positif (+1):**
`meningkat, pertumbuhan, naik, surplus, untung, laba, pulih, ekspansi, menguat, optimis, perbaikan, kenaikan, apresiasi, stabil, efisien, produktif, investasi, menguntungkan, positif, melambung, subur, makmur, sejahtera, maju, berkembang`

**Negatif (-1):**
`turun, penurunan, defisit, krisis, rugi, PHK, moratorium, resesi, stagnan, melemah, kontraksi, beban, gagal, bangkrut, pemotongan, refocussing, darurat, terpuruk, kolaps, mencekik, terlilit, macet, terhambat, kendala`

**Domain-specific:**
| Kata | Score | Alasan |
|---|---|---|
| `refocussing` | -1 | Pemotongan anggaran — selalu negatif di konteks Bappenas |
| `realokasi` | -0.5 | Anggaran dipindah — umumnya karena ada masalah |
| `efisiensi` | +0.5 | Positif jika konteks perbaikan |
| `pagu`, `DIPA`, `SAKTI` | 0 | Netral — istilah teknis |
| `revisi` | -0.3 | Biasanya karena ada perubahan yg tidak direncanakan |

### 4.2 Scoring Formula

```
lex_score = (Σ(positif × intensifier) + Σ(negatif × intensifier × -1))
            ÷ (total_kata_terdeteksi + 1)

Range: -1.000 (sangat negatif) s.d +1.000 (sangat positif)
```

**Negation:** Jika kata `tidak`/`belum`/`bukan` muncul 1-3 kata sebelum kata sentimen → balik nilai (`× -1`).

**Intensifier:**
| Kata | Multiplier |
|---|---|
| `sangat`, `amat`, `sangat sekali` | ×1.5 |
| `cukup` | ×0.7 |
| `agak`, `sedikit` | ×0.5 |
| `paling` | ×2.0 |

### 4.3 LLM Integration

LLM (DeepSeek v4 flash via OpenRouter) hanya dipanggil ketika lexicon memberikan hasil **ambigu**:

```typescript
if (Math.abs(lex_score) < 0.3) {
  // Borderline — butuh konteks dari LLM
  llm_score = await analyzeSentiment(judul, konten);
  final_score = (lex_score + llm_score) / 2;
  confidence = "medium";
} else {
  // Jelas — lexicon cukup
  final_score = lex_score;
  confidence = "high";
}
```

**LLM Prompt:**

```text
System: Anda adalah analis sentimen berita ekonomi Indonesia.
Gunakan metodologi berikut:
- Positif: pertumbuhan, peningkatan, surplus, perbaikan
- Negatif: penurunan, defisit, krisis, pemotongan, refocussing
- Netral: laporan faktual tanpa opini yang jelas

Analisis sentimen EKONOMI dari berita berikut (bukan sentimen umum).
Output dalam format JSON:
{"sentimen": "positif|negatif|netral", "score": -1.0..1.0, "alasan": "..."}

Berita: {judul}
```

### 4.4 Alert Rules

| Kondisi | Alert Level | Aksi |
|---|---|---|
| `confidence = high` AND `score < -0.5` | 🔴 **danger** | Muncul di widget dashboard |
| `confidence = high` AND `score < -0.3` | 🟡 **warning** | Muncul di widget |
| `confidence = medium` AND `score < -0.3` | 🟡 **warning** | Muncul di widget |
| `score >= -0.3` | ℹ️ **info** | Hanya di halaman detail |
| `confidence = medium` AND `score < -0.5` | 🟡 **warning** | Walau ragu, skor terlalu negatif |

### 4.5 Evaluasi

Untuk validasi akurasi:
1. Label manual 50 artikel random (positif/negatif/netral)
2. Bandingkan hasil lexicon vs hybrid vs manual
3. Hitung precision/recall/F1
4. Iterasi: tambah kata ke lexicon dari false negatives

---

## 5. Backend API

### Endpoints

| Method | Path | Auth | Deskripsi |
|---|---|---|---|
| `GET` | `/api/early-warning` | Session | List artikel (paginated, filterable) |
| `GET` | `/api/early-warning/summary` | Session | Data untuk widget dashboard |
| `POST` | `/api/early-warning/crawl` | Admin | Trigger crawl manual |

### GET /api/early-warning

**Query params:**
- `page` (default: 1)
- `limit` (default: 20)
- `sumber` — filter by sumber (cnbc, katadata, etc.)
- `sentimen` — filter (positif, negatif, netral)
- `alert` — filter (true = hanya yang is_alert=true)
- `q` — search by judul

**Response:**
```json
{
  "data": [
    {
      "id": 1,
      "judul": "Inflasi diperkirakan naik 0.5%",
      "sumber": "cnbc",
      "url": "https://...",
      "published_at": "2026-09-15T06:00:00Z",
      "sentimen": "negatif",
      "sentimen_score": -0.45,
      "confidence": "high",
      "ringkasan": "BI memperkirakan inflasi April naik...",
      "alert_level": "warning"
    }
  ],
  "meta": {
    "total": 150,
    "page": 1,
    "limit": 20,
    "total_pages": 8,
    "summary": {
      "total_alert": 5,
      "danger": 2,
      "warning": 3,
      "info": 145
    }
  }
}
```

### GET /api/early-warning/summary

**Response (untuk widget dashboard):**
```json
{
  "alerts": [
    { "judul": "...", "alert_level": "danger", "sumber": "cnbc", "sentimen_score": -0.7 }
  ],
  "trend": [
    { "tanggal": "2026-09-09", "avg_score": -0.1, "total": 12 },
    { "tanggal": "2026-09-10", "avg_score": 0.05, "total": 15 }
  ],
  "stats": {
    "total_hari_ini": 18,
    "danger": 2,
    "warning": 3
  }
}
```

### POST /api/early-warning/crawl

Trigger manual crawler. Admin only. Menjalankan pipeline RSS fetch + analisis secara sinkron.

**Response:**
```json
{
  "success": true,
  "new_articles": 12,
  "errors": 0
}
```

---

## 6. Frontend

### 6.1 Widget — PortalDashboard

Komponen `EarlyWarningWidget.tsx` yang muncul di halaman utama dashboard:

```
┌──────────────────────────────────────────┐
│ 🛰️ Early Warning         [Lihat Detail→]  │
│                                            │
│ 🔴 Inflasi diperkirakan naik 0.5%         │
│    CNBC • 2 jam lalu • score: -0.45       │
│                                            │
│ 🟡 Refocussing anggaran digelar           │
│    Katadata • 5 jam lalu • score: -0.32   │
│                                            │
│ ℹ️ Realisasi APBN capai 28%               │
│    Antara • 1 jam lalu • score: +0.12     │
│                                            │
│ 📈 [bar: ██░░░░] Rata-rata: -0.08 (7 hr)  │
└──────────────────────────────────────────┘
```

**Data source:** `GET /api/early-warning/summary`
**Refresh:** Auto-fetch tiap 5 menit (atau manual refresh)

### 6.2 Halaman Detail — /portal/early-warning

Komponen `EarlyWarning.tsx`:

```
┌──────────────────────────────────────────────┐
│ 🛰️ Early Warning Dashboard                   │
│                                                │
│ 🔴 2 Danger    🟡 3 Warning    ℹ️ 145 Info    │
│                                                │
│ [Semua Sumber ▼] [Sentimen ▼] [🔍 Cari...]   │
│                                                │
│ ┌──────────────────────────────────────────┐  │
│ │ 🔴 Inflasi diperkirakan naik 0.5%       │  │
│ │    CNBC Indonesia • 15 Sep 2026          │  │
│ │    Ringkasan: BI memperkirakan inflasi   │  │
│ │    April naik 0.5% akibat harga pangan.. │  │
│ │    🏷️ inflasi, harga pangan, BI         │  │
│ └──────────────────────────────────────────┘  │
│                                                │
│ ┌──────────────────────────────────────────┐  │
│ │ 📈 Tren Sentimen 7 Hari                  │  │
│ │ [Grafik batang: positif=hijau, negatif=  │  │
│ │  merah, netral=abu]                      │  │
│ └──────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

**Features:**
- Filter by sumber (dropdown)
- Filter by sentimen (positif/negatif/netral)
- Search by judul
- Pagination (20 per page)
- Expandable card untuk lihat ringkasan + keyword
- Grafik tren sentimen 7 hari (SVG/Canvas)
- Tiap card punya badge warna sesuai alert level

### 6.3 Sidebar Menu

Tambah item di PortalLayout.tsx:

```tsx
{
  label: "🛰️ Early Warning",
  href: "/portal/early-warning",
  icon: "satellite",
}
```

### 6.4 Route

Di App.tsx (atau file routing):

```tsx
import EarlyWarning from "./pages/portal/EarlyWarning";

<Route path="/portal/early-warning" element={<EarlyWarning />} />
```

---

## 7. Data Flow — Crawler Pipeline

### 7.1 Cron Schedule

```
Setiap 6 jam: 00:00, 06:00, 12:00, 18:00 WIB
```

### 7.2 Pipeline Steps

```
1. FETCH RSS
   - Ambil 6 URL RSS secara paralel
   - Parse XML → extract: title, link, description, pubDate
   - Filter: skip jika URL sudah ada di DB (UNIQUE constraint)

2. LEXICON SCORING (gratis, ≈0.001s/article)
   - Tokenize judul + deskripsi
   - Cocokkan dengan kamus sentimen
   - Handle negation + intensifier
   - Output: lex_score (-1..1)

3. LLM ANALYSIS (≈$0.0003/article, hanya jika borderline)
   - Jika |lex_score| < 0.3 → panggil DeepSeek via OpenRouter
   - Prompt: analisis sentimen ekonomi + JSON output
   - Output: llm_score + keyword + ringkasan

4. FINAL SCORE
   - Jika LLM dipanggil: final = (lex + llm) / 2, confidence = "medium"
   - Jika tidak: final = lex, confidence = "high"

5. ALERT DETERMINATION
   - Tentukan alert_level berdasarkan rules di §4.4
   - Set is_alert = true jika alert_level != "info"

6. STORE
   - INSERT ke tabel early_warnings
   - Jika duplicate URL → skip (ON CONFLICT DO NOTHING)
```

### 7.3 Biaya Operasional

| Komponen | Per Crawl (≈30 artikel baru) | Per Hari (4× crawl) | Per Bulan |
|---|---|---|---|
| Lexicon | $0 | $0 | $0 |
| LLM (≈30% borderline = 9 artikel) | ~$0.003 | ~$0.012 | **~$0.36** |
| Total | ~$0.003 | ~$0.012 | **< $1** |

---

## 8. File List

### New Files

| Path | Type | Description |
|---|---|---|
| `backend/src/db/migrations/011_early_warnings.sql` | DB | Migration tabel |
| `backend/src/routes/early-warning.ts` | Backend | API endpoints + crawler logic |
| `backend/src/lib/lexicon.ts` | Backend | Kamus sentimen + scoring engine |
| `backend/src/lib/llm-sentiment.ts` | Backend | LLM prompt untuk sentimen |
| `frontend/src/pages/portal/EarlyWarning.tsx` | Frontend | Halaman detail |
| `frontend/src/components/portal/EarlyWarningWidget.tsx` | Frontend | Widget dashboard |

### Modified Files

| Path | Change |
|---|---|
| `backend/src/app.ts` | Register route `/api/early-warning` |
| `frontend/src/pages/portal/PortalDashboard.tsx` | Tambah widget EarlyWarningWidget |
| `frontend/src/pages/portal/PortalLayout.tsx` | Tambah sidebar menu |
| `frontend/src/App.tsx` | Tambah route `/portal/early-warning` |

---

## 9. Implementation Order

| Phase | Items | Est. Time |
|---|---|---|
| **1** | DB migration + Lexicon engine + scoring | 30 menit |
| **2** | Backend endpoints + LLM integration | 45 menit |
| **3** | Frontend widget (dashboard) | 30 menit |
| **4** | Frontend halaman detail | 45 menit |
| **5** | Sidebar + route + deploy + cron | 15 menit |
| **Total** | | **~2.5 jam** |

---

## 10. Glossary

| Term | Definition |
|---|---|
| **Lexicon** | Kamus kata dengan bobot sentimen (positif/negatif/netral) |
| **Hybrid** | Gabungan 2+ metode (di sini: lexicon + LLM) |
| **Sentimen Score** | Nilai -1 s.d +1 yang merepresentasikan negatif-positif |
| **Confidence** | Tingkat keyakinan hasil analisis (high/medium/low) |
| **Alert Level** | Tingkat urgensi: info (hijau) → warning (kuning) → danger (merah) |
| **Refocussing** | Pemotongan/pengalihan anggaran — konteks negatif di Bappenas |
| **Borderline** | Skor sentimen antara -0.3 s.d 0.3 — butuh analisis lebih lanjut |
