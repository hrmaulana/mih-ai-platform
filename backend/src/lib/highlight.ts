/**
 * highlight.ts — modul highlight keyword PKPN & Makropembangunan (dashboard berita).
 *
 * Inti (buildMatcher/findMatches/segment/detectClusters/relevanceFloor/applyFloor/
 * validateLLMKeywords) kini tinggal di `shared/highlight-core.ts` supaya tidak lagi
 * disalin identik antar paket. Berkas ini hanya menyimpan DATA keyword milik backend.
 *
 * - Tanpa dependensi, jalan di Bun/Node (ESM).
 * - Highlight dilakukan lewat kode, bukan LLM, sehingga hasilnya pasti muncul
 *   persis di teks. Keyword dari LLM bisa diverifikasi dengan validateLLMKeywords().
 * - Keyword "weak" (mudah muncul di konteks non-PKPN) tetap di-highlight tetapi
 *   tidak menaikkan skor relevansi.
 *
 * Cara pakai (React):
 *   import { segment } from "./highlight";
 *   segment(text).map((s, i) => s.match
 *     ? <mark key={i} className={`hl hl-${s.match.cat}`}>{s.text}</mark>
 *     : s.text);
 */

import { createHighlight, type KeywordEntry } from "../../../shared/highlight-core";

export type {
  ClusterResult,
  KeywordEntry,
  MatchResult,
  Matcher,
  SegmentResult,
} from "../../../shared/highlight-core";

export const CLUSTERS: Record<number, string> = {
  1: "Kedaulatan Pangan",
  2: "Kemandirian Energi dan Air",
  3: "Pendidikan",
  4: "Kesehatan",
  5: "Hilirisasi dan Industrialisasi",
  6: "Infrastruktur, Perumahan dan Ketahanan Bencana",
  7: "Ekonomi Kerakyatan dan Desa",
  8: "Penurunan Kemiskinan",
}

export const CLUSTER_ICONS: Record<number, string> = {
  1: "🌾",
  2: "⚡",
  3: "🎓",
  4: "🏥",
  5: "🏭",
  6: "🏗️",
  7: "🏘️",
  8: "📉",
}

// K(kategori, klaster[], variasi penulisan[], weak?)
const K = (cat: string, cluster: number[], terms: string[], weak = false): KeywordEntry => ({ cat, cluster, terms, weak })

export const KEYWORDS: KeywordEntry[] = [
  // ---- Umum PKPN ----
  K("pkpn", [], ["PKPN", "Program Kerja Prioritas Nasional"]),

  // ---- 1. Kedaulatan Pangan ----
  K("pkpn", [1], ["Kampung Nelayan Merah Putih", "KNMP"]),
  K("pkpn", [1], ["Kapal Ikan Modern", "modernisasi kapal perikanan"]),
  K("pkpn", [1], ["Budidaya Ikan Darat Tematik", "budidaya ikan darat", "bioflok", "minapadi"]),
  K("pkpn", [1], ["Tambak Nila Salin", "nila salin"]),
  K("pkpn", [1], ["Tambak Udang Terintegrasi", "tambak udang", "Waingapu"]),
  K("pkpn", [1], ["Kawasan Sentra Industri Garam Nasional", "K-SIGN", "KSIGN", "swasembada garam"]),
  K("pkpn", [1], ["Kawasan Pangan Terintegrasi", "Kawasan Perkebunan"]),

  // ---- 2. Kemandirian Energi dan Air ----
  K("pkpn", [2], ["Biodiesel 50", "B50"]),
  K("pkpn", [2], ["Bioetanol 20", "E20", "bioetanol"]),
  K("pkpn", [2], ["PLTS 100 GW", "PLTS 100GW", "100 Gigawatt PLTS", "100 GW PLTS"]),
  K("pkpn", [2], ["Standar Kinerja Energi Minimum", "SKEM"]),
  K("pkpn", [2], ["Jaringan Gas Kota", "Jargas"]),
  K("pkpn", [2], ["Small Scale Green Modular Refinery", "Green Modular Refinery"]),
  K("pkpn", [2], ["sumur minyak masyarakat", "sumur tua"]),
  K("pkpn", [2], ["Sampah menjadi Energi Listrik", "PSEL", "waste-to-energy", "waste to energy", "WtE"]),
  K("pkpn", [2], ["swasembada air", "konversi motor listrik", "kompor listrik", "PLTA skala besar"]),
  K("pkpn", [2], ["lifting", "elektrifikasi"], true),

  // ---- 3. Pendidikan ----
  K("pkpn", [3, 4], ["Makan Bergizi Gratis", "MBG"]),
  K("pkpn", [3], ["Sekolah Rakyat", "Sekolah Garuda", "Sekolah Nasional Terintegrasi", "Studio Guru"]),
  K("pkpn", [3], ["revitalisasi sekolah", "revitalisasi madrasah", "papan interaktif digital", "digitalisasi pendidikan"]),
  K("pkpn", [3], ["PP TUNAS", "Medical University", "SMK Go Global", "Akademi Olahraga Nasional"]),

  // ---- 4. Kesehatan ----
  K("pkpn", [4], ["Cek Kesehatan Gratis", "Pemeriksaan Kesehatan Gratis", "CKG"]),
  K("pkpn", [4], ["rumah sakit upgrade"]),
  K("pkpn", [4], ["tuberkulosis", "TBC"], true),

  // ---- 5. Hilirisasi dan Industrialisasi ----
  K("pkpn", [5], ["hilirisasi", "smelter", "semikonduktor"], true),
  K("pkpn", [5], ["Hilirisasi Industri Strategis", "mobil nasional", "motor nasional", "industri kedirgantaraan"]),

  // ---- 6. Infrastruktur, Perumahan, Ketahanan Bencana ----
  K("pkpn", [6], ["Giant Sea Wall", "tanggul laut raksasa"]),
  K("pkpn", [6], ["Gerakan ASRI", "gentengisasi"]),
  K("pkpn", [6], ["3 Juta Rumah", "program 3 juta rumah"]),
  K("pkpn", [6], ["rekonstruksi pascabencana Sumatera", "rehabilitasi pascabencana Sumatera", "jaringan kereta api nasional"]),

  // ---- 7. Ekonomi Kerakyatan dan Desa ----
  K("pkpn", [7], ["Koperasi Desa Merah Putih", "Koperasi Kelurahan Merah Putih", "Kopdes Merah Putih", "KDMP"]),
  K("pkpn", [7], ["daerah 3T", "percepatan pembangunan daerah 3T"]),

  // ---- 8. Penurunan Kemiskinan ----
  K("pkpn", [8], ["PRO-KESRA", "PROKESRA", "bantuan sosial terintegrasi"]),

  // ---- Makropembangunan ----
  K("makro", [], ["RPJMN", "RPJPN", "RKP", "Indonesia Emas 2045", "Kerangka Ekonomi Makro"]),
  K("makro", [], ["pertumbuhan ekonomi", "PDB", "produk domestik bruto"]),
  K("makro", [], ["inflasi", "deflasi", "suku bunga", "nilai tukar", "rupiah"]),
  K("makro", [], ["APBN", "defisit", "neraca perdagangan", "neraca pembayaran", "surplus perdagangan"]),
  K("makro", [], ["kemiskinan", "pengangguran", "ketimpangan", "daya beli", "rasio Gini"]),
  K("makro", [], ["Danantara", "Patriot Bonds", "industrialisasi", "produktivitas"]),
]

const core = createHighlight(KEYWORDS)

export const findMatches = core.findMatches
export const segment = core.segment
export const detectClusters = core.detectClusters
export const relevanceFloor = core.relevanceFloor
export const applyFloor = core.applyFloor
export const validateLLMKeywords = core.validateLLMKeywords
