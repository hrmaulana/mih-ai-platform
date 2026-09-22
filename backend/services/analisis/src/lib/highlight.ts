/**
 * highlight.ts — Modul highlight keyword PKPN & Makropembangunan
 *
 * Tanpa dependensi, jalan di Bun/Node (ESM).
 */

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

interface KeywordEntry {
  cat: string;
  cluster: number[];
  terms: string[];
  weak: boolean;
}

const K = (cat: string, cluster: number[], terms: string[], weak = false): KeywordEntry => ({ cat, cluster, terms, weak });

const KEYWORDS: KeywordEntry[] = [
  K("pkpn", [], ["PKPN", "Program Kerja Prioritas Nasional"]),
  K("pkpn", [1], ["Kampung Nelayan Merah Putih", "KNMP"]),
  K("pkpn", [1], ["Kapal Ikan Modern", "modernisasi kapal perikanan"]),
  K("pkpn", [1], ["Budidaya Ikan Darat Tematik", "budidaya ikan darat", "bioflok", "minapadi"]),
  K("pkpn", [1], ["Tambak Nila Salin", "nila salin"]),
  K("pkpn", [1], ["Tambak Udang Terintegrasi", "tambak udang", "Waingapu"]),
  K("pkpn", [1], ["Kawasan Sentra Industri Garam Nasional", "K-SIGN", "KSIGN", "swasembada garam"]),
  K("pkpn", [1], ["Kawasan Pangan Terintegrasi", "Kawasan Perkebunan"]),
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
  K("pkpn", [3, 4], ["Makan Bergizi Gratis", "MBG"]),
  K("pkpn", [3], ["Sekolah Rakyat", "Sekolah Garuda", "Sekolah Nasional Terintegrasi", "Studio Guru"]),
  K("pkpn", [3], ["revitalisasi sekolah", "revitalisasi madrasah", "papan interaktif digital", "digitalisasi pendidikan"]),
  K("pkpn", [3], ["PP TUNAS", "Medical University", "SMK Go Global", "Akademi Olahraga Nasional"]),
  K("pkpn", [4], ["Cek Kesehatan Gratis", "Pemeriksaan Kesehatan Gratis", "CKG"]),
  K("pkpn", [4], ["rumah sakit upgrade"]),
  K("pkpn", [4], ["tuberkulosis", "TBC"], true),
  K("pkpn", [5], ["hilirisasi", "smelter", "semikonduktor"], true),
  K("pkpn", [5], ["Hilirisasi Industri Strategis", "mobil nasional", "motor nasional", "industri kedirgantaraan"]),
  K("pkpn", [6], ["Giant Sea Wall", "tanggul laut raksasa"]),
  K("pkpn", [6], ["Gerakan ASRI", "gentengisasi"]),
  K("pkpn", [6], ["3 Juta Rumah", "program 3 juta rumah"]),
  K("pkpn", [6], ["rekonstruksi pascabencana Sumatera", "rehabilitasi pascabencana Sumatera", "jaringan kereta api nasional"]),
  K("pkpn", [7], ["Koperasi Desa Merah Putih", "Koperasi Kelurahan Merah Putih", "Kopdes Merah Putih", "KDMP"]),
  K("pkpn", [7], ["daerah 3T", "percepatan pembangunan daerah 3T"]),
  K("pkpn", [8], ["PRO-KESRA", "PROKESRA", "bantuan sosial terintegrasi"]),
  K("makro", [], ["RPJMN", "RPJPN", "RKP", "Indonesia Emas 2045", "Kerangka Ekonomi Makro"]),
  K("makro", [], ["pertumbuhan ekonomi", "PDB", "produk domestik bruto"]),
  K("makro", [], ["inflasi", "deflasi", "suku bunga", "nilai tukar", "rupiah"]),
  K("makro", [], ["APBN", "defisit", "neraca perdagangan", "neraca pembayaran", "surplus perdagangan"]),
  K("makro", [], ["kemiskinan", "pengangguran", "ketimpangan", "daya beli", "rasio Gini"]),
  K("makro", [], ["Danantara", "Patriot Bonds", "industrialisasi", "produktivitas"]),
];

interface MatchResult {
  start: number;
  end: number;
  text: string;
  cat: string;
  cluster: number[];
  weak: boolean;
}

interface ClusterResult {
  klaster: number[];
  hits: Record<number, number>;
  strong: number;
  weak: number;
  literalPKPN: boolean;
}

interface Matcher {
  source: string;
  lookup: Map<string, KeywordEntry>;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const flex = (term: string) => term.trim().split(/\s+/).map(esc).join("\\s+");

function buildMatcher(entries: KeywordEntry[] = KEYWORDS): Matcher {
  const lookup = new Map<string, KeywordEntry>();
  const terms: string[] = [];
  for (const e of entries) {
    for (const t of e.terms) {
      lookup.set(norm(t), e);
      terms.push(t);
    }
  }
  terms.sort((a, b) => b.length - a.length);
  const alt = terms.map(flex).join("|");
  const source = `(?<![\\p{L}\\p{N}])(?:${alt})(?![\\p{L}\\p{N}])`;
  return { source, lookup };
}

const DEFAULT = buildMatcher();

export function findMatches(text: string, matcher: Matcher = DEFAULT): MatchResult[] {
  if (!text) return [];
  const re = new RegExp(matcher.source, "giu");
  const out: MatchResult[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const e = matcher.lookup.get(norm(m[0]));
    if (!e) continue;
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      cat: e.cat,
      cluster: e.cluster,
      weak: e.weak,
    });
  }
  return out;
}

export function detectClusters(text: string, matcher: Matcher = DEFAULT): ClusterResult {
  const hits: Record<number, number> = {};
  let strong = 0, weak = 0, literalPKPN = false;
  for (const m of findMatches(text, matcher)) {
    if (m.cat !== "pkpn") continue;
    if (m.weak) { weak++; continue; }
    strong++;
    if (/^(pkpn|program\s+kerja\s+prioritas\s+nasional)$/i.test(m.text)) literalPKPN = true;
    for (const c of m.cluster) hits[c] = (hits[c] || 0) + 1;
  }
  const klaster = Object.keys(hits).map(Number).sort((a, b) => hits[b] - hits[a] || a - b);
  return { klaster, hits, strong, weak, literalPKPN };
}

export function relevanceFloor(text: string, matcher: Matcher = DEFAULT): number {
  const d = detectClusters(text, matcher);
  if (d.literalPKPN) return 3;
  if (d.strong > 0) return 2;
  const macro = findMatches(text, matcher).some((m) => m.cat === "makro" && !m.weak);
  return macro ? 1 : 0;
}

export function applyFloor(llmRelevansi: number | null, text: string, matcher: Matcher = DEFAULT): number {
  return Math.max(llmRelevansi ?? 0, relevanceFloor(text, matcher));
}

export function validateLLMKeywords(text: string, llmKeywords: { kata: string; kategori?: string }[] = []): { kata: string; kategori?: string }[] {
  const hay = norm(text);
  return llmKeywords.filter((k) => k && k.kata && hay.includes(norm(k.kata)));
}