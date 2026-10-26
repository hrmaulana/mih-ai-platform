/**
 * keywords.ts — data kanonik keyword PKPN & Makropembangunan + label klaster.
 *
 * Sebelumnya daftar ini disalin identik di backend, service analisis, service
 * crawler, dan frontend. Kini satu sumber di `shared/`; paket yang ingin
 * menambah keyword sendiri bisa memakai `defineKeyword` lalu
 * `[...BASE_KEYWORDS, defineKeyword(...)]`.
 */

import type { KeywordEntry } from "./highlight-core";

export const CLUSTERS: Record<number, string> = {
  1: "Kedaulatan Pangan",
  2: "Kemandirian Energi dan Air",
  3: "Pendidikan",
  4: "Kesehatan",
  5: "Hilirisasi dan Industrialisasi",
  6: "Infrastruktur, Perumahan dan Ketahanan Bencana",
  7: "Ekonomi Kerakyatan dan Desa",
  8: "Penurunan Kemiskinan",
};

export const CLUSTER_ICONS: Record<number, string> = {
  1: "🌾", 2: "⚡", 3: "🎓", 4: "🏥", 5: "🏭", 6: "🏗️", 7: "🏘️", 8: "📉",
};

/** Helper ringkas untuk mendefinisikan satu entri keyword. */
export const defineKeyword = (
  cat: string,
  cluster: number[],
  terms: string[],
  weak = false,
): KeywordEntry => ({ cat, cluster, terms, weak });

export const BASE_KEYWORDS: KeywordEntry[] = [
  // ---- Umum PKPN ----
  defineKeyword("pkpn", [], ["PKPN", "Program Kerja Prioritas Nasional"]),

  // ---- 1. Kedaulatan Pangan ----
  defineKeyword("pkpn", [1], ["Kampung Nelayan Merah Putih", "KNMP"]),
  defineKeyword("pkpn", [1], ["Kapal Ikan Modern", "modernisasi kapal perikanan"]),
  defineKeyword("pkpn", [1], ["Budidaya Ikan Darat Tematik", "budidaya ikan darat", "bioflok", "minapadi"]),
  defineKeyword("pkpn", [1], ["Tambak Nila Salin", "nila salin"]),
  defineKeyword("pkpn", [1], ["Tambak Udang Terintegrasi", "tambak udang", "Waingapu"]),
  defineKeyword("pkpn", [1], ["Kawasan Sentra Industri Garam Nasional", "K-SIGN", "KSIGN", "swasembada garam"]),
  defineKeyword("pkpn", [1], ["Kawasan Pangan Terintegrasi", "Kawasan Perkebunan"]),

  // ---- 2. Kemandirian Energi dan Air ----
  defineKeyword("pkpn", [2], ["Biodiesel 50", "B50"]),
  defineKeyword("pkpn", [2], ["Bioetanol 20", "E20", "bioetanol"]),
  defineKeyword("pkpn", [2], ["PLTS 100 GW", "PLTS 100GW", "100 Gigawatt PLTS", "100 GW PLTS"]),
  defineKeyword("pkpn", [2], ["Standar Kinerja Energi Minimum", "SKEM"]),
  defineKeyword("pkpn", [2], ["Jaringan Gas Kota", "Jargas"]),
  defineKeyword("pkpn", [2], ["Small Scale Green Modular Refinery", "Green Modular Refinery"]),
  defineKeyword("pkpn", [2], ["sumur minyak masyarakat", "sumur tua"]),
  defineKeyword("pkpn", [2], ["Sampah menjadi Energi Listrik", "PSEL", "waste-to-energy", "waste to energy", "WtE"]),
  defineKeyword("pkpn", [2], ["swasembada air", "konversi motor listrik", "kompor listrik", "PLTA skala besar"]),
  defineKeyword("pkpn", [2], ["lifting", "elektrifikasi"], true),

  // ---- 3. Pendidikan ----
  defineKeyword("pkpn", [3, 4], ["Makan Bergizi Gratis", "MBG"]),
  defineKeyword("pkpn", [3], ["Sekolah Rakyat", "Sekolah Garuda", "Sekolah Nasional Terintegrasi", "Studio Guru"]),
  defineKeyword("pkpn", [3], ["revitalisasi sekolah", "revitalisasi madrasah", "papan interaktif digital", "digitalisasi pendidikan"]),
  defineKeyword("pkpn", [3], ["PP TUNAS", "Medical University", "SMK Go Global", "Akademi Olahraga Nasional"]),

  // ---- 4. Kesehatan ----
  defineKeyword("pkpn", [4], ["Cek Kesehatan Gratis", "Pemeriksaan Kesehatan Gratis", "CKG"]),
  defineKeyword("pkpn", [4], ["rumah sakit upgrade"]),
  defineKeyword("pkpn", [4], ["tuberkulosis", "TBC"], true),

  // ---- 5. Hilirisasi dan Industrialisasi ----
  defineKeyword("pkpn", [5], ["hilirisasi", "smelter", "semikonduktor"], true),
  defineKeyword("pkpn", [5], ["Hilirisasi Industri Strategis", "mobil nasional", "motor nasional", "industri kedirgantaraan"]),

  // ---- 6. Infrastruktur, Perumahan, Ketahanan Bencana ----
  defineKeyword("pkpn", [6], ["Giant Sea Wall", "tanggul laut raksasa"]),
  defineKeyword("pkpn", [6], ["Gerakan ASRI", "gentengisasi"]),
  defineKeyword("pkpn", [6], ["3 Juta Rumah", "program 3 juta rumah"]),
  defineKeyword("pkpn", [6], ["rekonstruksi pascabencana Sumatera", "rehabilitasi pascabencana Sumatera", "jaringan kereta api nasional"]),

  // ---- 7. Ekonomi Kerakyatan dan Desa ----
  defineKeyword("pkpn", [7], ["Koperasi Desa Merah Putih", "Koperasi Kelurahan Merah Putih", "Kopdes Merah Putih", "KDMP"]),
  defineKeyword("pkpn", [7], ["daerah 3T", "percepatan pembangunan daerah 3T"]),

  // ---- 8. Penurunan Kemiskinan ----
  defineKeyword("pkpn", [8], ["PRO-KESRA", "PROKESRA", "bantuan sosial terintegrasi"]),

  // ---- Makropembangunan ----
  defineKeyword("makro", [], ["RPJMN", "RPJPN", "RKP", "Indonesia Emas 2045", "Kerangka Ekonomi Makro"]),
  defineKeyword("makro", [], ["pertumbuhan ekonomi", "PDB", "produk domestik bruto"]),
  defineKeyword("makro", [], ["inflasi", "deflasi", "suku bunga", "nilai tukar", "rupiah"]),
  defineKeyword("makro", [], ["APBN", "defisit", "neraca perdagangan", "neraca pembayaran", "surplus perdagangan"]),
  defineKeyword("makro", [], ["kemiskinan", "pengangguran", "ketimpangan", "daya beli", "rasio Gini"]),
  defineKeyword("makro", [], ["Danantara", "Patriot Bonds", "industrialisasi", "produktivitas"]),
];
