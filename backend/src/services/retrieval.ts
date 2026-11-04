// Retrieval hibrida (vektor + leksikal) dan keputusan abstain - tanpa dependency baru.
//
// Baseline 30 Okt 2026: retrieval murni vektor menemukan chunk sumber pada 58,3% kasus,
// padahal chunk itu SELALU bisa ditemukan (100%) bila kuerinya memakai kosakata dokumen.
// Celahnya di jembatan antara cara pengguna bertanya dan kosakata dokumen - bukan embedding.

const STOPWORDS = new Set(['dan', 'atau', 'yang', 'di', 'ke', 'dari', 'pada', 'dalam', 'untuk', 'dengan', 'adalah', 'itu', 'ini', 'berapa', 'apa', 'apakah', 'bagaimana', 'mengapa', 'siapa', 'kapan', 'dimana', 'tahun', 'oleh', 'akan', 'tidak', 'juga', 'agar', 'para', 'sebagai', 'terhadap', 'secara', 'lebih', 'bisa', 'dapat', 'ada', 'the', 'of', 'to', 'a', 'is', 'are']);

/** Pecah teks menjadi token berarti: huruf/angka, angka desimal & persen dipertahankan. */
export function tokenize(text: string): string[] {
  const mentah = (text || "").toLowerCase().match(/[a-z0-9]+(?:[,.][0-9]+)?%?/g) ?? [];
  const hasil: string[] = [];
  for (const r of mentah) {
    const tok = r.replace(/^[,.]+/, "").replace(/[,.]+$/, "");
    if (!tok) continue;
    if (/^[0-9]/.test(tok)) { hasil.push(tok); continue; }
    if (tok.length >= 3 && !STOPWORDS.has(tok)) hasil.push(tok);
  }
  return hasil;
}

/** Angka & persentase berbobot lebih besar: fakta kuantitatif penentu jawaban. */
export function bobotToken(tok: string): number {
  if (!/[0-9]/.test(tok)) return 1;
  return /%/.test(tok) || /[0-9],[0-9]/.test(tok) ? 3 : 2;
}

/** Cakupan token kueri di dalam teks (0..1), diberi bobot angka/persentase. */
export function lexicalScore(query: string, content: string): number {
  const unik = [...new Set(tokenize(query))];
  if (unik.length === 0) return 0;
  const isi = (content || "").toLowerCase();
  let total = 0, dapat = 0;
  for (const tok of unik) {
    const w = bobotToken(tok);
    total += w;
    if (isi.includes(tok)) dapat += w;
  }
  return total === 0 ? 0 : dapat / total;
}

/** Reciprocal Rank Fusion: gabungkan dua peringkat tanpa perlu menyetarakan skala. */
export function rrfFuse(vektor: { id: number }[], leksikal: { id: number }[], k = 60): Map<number, number> {
  const skor = new Map<number, number>();
  const tambah = (rows: { id: number }[]) => {
    rows.forEach((r, i) => skor.set(r.id, (skor.get(r.id) ?? 0) + 1 / (k + i + 1)));
  };
  tambah(vektor);
  tambah(leksikal);
  return skor;
}

/** Penjaga deterministik: bila tidak ada hasil atau skor terbaik di bawah ambang, paksa menolak. */
/**
 * Abstain terkalibrasi: vektor rendah TAPI bukti leksikal kuat → tetap jawab.
 * Mengurangi "menolak padahal sumbernya ada" tanpa membiarkan halusinasi.
 */
export function decideAbstainKalibrasi(
  bestScore: number | null,
  lexScore: number,
  ambang: number,
  ambangLex: number,
): boolean {
  if (bestScore === null) return false;
  if (bestScore >= ambang) return false;
  return lexScore < ambangLex;
}

export function decideAbstain(bestScore: number | null, ambang: number): boolean {
  if (bestScore === null || Number.isNaN(bestScore)) return true;
  return bestScore < ambang;
}


/** Varian kueri untuk ekspansi: kueri asli + kantong kata kunci (tanpa kata tanya).
 *  Pertanyaan percakapan ter-embed berbeda dari gaya bahasa dokumen; beberapa
 *  varian menaikkan peluang chunk sumber ikut terambil. */
export function varianKueri(question: string): string[] {
  const asli = (question || "").trim();
  const tok = tokenize(asli);
  const kandidat = [asli, tok.join(" ")];
  if (tok.length > 4) kandidat.push(tok.slice(-Math.ceil(tok.length / 2)).join(" "));
  const bersih: string[] = [];
  for (const k of kandidat) {
    const t = k.trim();
    if (t && !bersih.includes(t)) bersih.push(t);
  }
  return bersih;
}

/** RRF untuk banyak peringkat (ekspansi kueri menambah sumber kandidat). */
export function rrfFuseBanyak(daftar: { id: number }[][], k = 60): Map<number, number> {
  const skor = new Map<number, number>();
  for (const rows of daftar) {
    rows.forEach((r, i) => skor.set(r.id, (skor.get(r.id) ?? 0) + 1 / (k + i + 1)));
  }
  return skor;
}


/** Pecah chunk menjadi kalimat untuk penskoran tingkat-kalimat (MaxSim). */
export function pecahKalimat(teks: string, maksKalimat = 8, panjangMin = 15): string[] {
  const kasar = (teks || "").replace(/\s+/g, " ").split(/(?<=[.!?])\s+/);
  const hasil: string[] = [];
  for (const k of kasar) {
    const t = k.trim();
    if (t.length < panjangMin) continue;
    hasil.push(t.length > 400 ? t.slice(0, 400) : t);
    if (hasil.length >= maksKalimat) break;
  }
  return hasil;
}

/** Kemiripan kosinus tertinggi antara kueri dan kumpulan kalimat (MaxSim). */
export function skorMaxSim(kueri: number[], kalimat: number[][]): number {
  if (!kueri || kueri.length === 0 || kalimat.length === 0) return 0;
  const norm = (v: number[]) => {
    const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    return n === 0 ? v.map(() => 0) : v.map((x) => x / n);
  };
  const q = norm(kueri);
  let terbaik = 0;
  for (const k of kalimat) {
    if (!k || k.length === 0) continue;
    const kk = norm(k);
    let dot = 0;
    for (let i = 0; i < q.length; i++) dot += q[i] * kk[i];
    if (dot > terbaik) terbaik = dot;
  }
  return terbaik;
}


/** Penulisan ulang kueri hanya bila pencarian awal lemah (hemat 1 panggilan LLM,
 *  dan menghindari efek samping tulis-ulang pada kasus yang sudah benar). */
export function perluTulisUlang(simTerbaik: number | null, jumlahLeksikal: number, ambang = 0.65): boolean {
  if (simTerbaik === null || Number.isNaN(simTerbaik)) return true;
  if (jumlahLeksikal === 0) return true;
  return simTerbaik < ambang;
}
