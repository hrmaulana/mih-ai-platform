# Spesifikasi Implementasi: Pantau Berita PKPN

Dokumen ini untuk agent/developer yang mengimplementasikan aplikasi analitik berita untuk perencana di Kedeputian Bidang Perencanaan Makro Pembangunan, Bappenas. Baca seluruhnya sebelum menulis kode.

## File Pendamping
| File | Fungsi |
|---|---|
| `highlight.js` | Modul highlight keyword PKPN dan Makropembangunan |
| `dashboard-pkpn.html` | Prototipe tampilan dashboard (data dummy) |

## 1. Tujuan Produk
Menjawab 3 pertanyaan per berita:
1. Perlu diketahui? (relevansi)
2. Baik/buruk bagi target Indonesia? (dampak)
3. Menyangkut program PKPN mana? (klaster 1-8)

## 2. Tiga Sumbu Penilaian
| Sumbu | Skala |
|---|---|
| relevansi | 0-3 |
| dampak | positif/negatif/netral/tidak_ada |
| sentimen_teks | positif/negatif/netral |

## 3. 8 Klaster PKPN
1. Kedaulatan Pangan
2. Kemandirian Energi dan Air
3. Pendidikan
4. Kesehatan
5. Hilirisasi dan Industrialisasi
6. Infrastruktur, Perumahan dan Ketahanan Bencana
7. Ekonomi Kerakyatan dan Desa
8. Penurunan Kemiskinan

## 4. API Endpoints
| Method | Path | Fungsi |
|---|---|---|
| GET | /api/klaster/ringkasan | Ringkasan per klaster |
| GET | /api/tren | Tren mingguan |
| GET | /api/berita | Daftar berita |
| GET | /api/program | Daftar program |
| GET | /api/antrean-review | Antrean review manual |
| POST | /api/review | Submit review |

## 5. Database
- articles
- article_scores
- reviews

## 6. Urutan Pengerjaan
1. highlight.js terpasang + uji
2. DB + ingest + dedup
3. Pipeline LLM + validasi + applyFloor
4. Golden set + evaluasi
5. API
6. Frontend (acuan dashboard-pkpn.html)
7. Antrean review
8. Iterasi prompt

Full spesifikasi: lihat file SPEC-pantau-berita-pkpn.md