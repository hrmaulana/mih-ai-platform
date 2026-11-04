/**
 * Reranker ringan — tanpa model tambahan.
 *
 * Menggabungkan sinyal yang sudah tersedia di tahap 1:
 *   - kemiripan vektor (sim)
 *   - cakupan leksikal (lexicalScore)
 *   - kecocokan entitas/angka/tahun (angka di pertanyaan harus muncul di chunk)
 *   - kecocokan judul dokumen / bagian
 * lalu memilih k hasil dengan MMR + batas per dokumen agar konteks tidak
 * didominasi satu dokumen.
 *
 * Semua fungsi murni → bisa dites tanpa DB dan dipakai harness.
 */

export interface Kandidat {
  id: number;
  content: string;
  filename?: string | null;
  section_title?: string | null;
  sim?: number | null;
  document_id?: number | null;
}

export interface BobotRerank {
  sim: number;
  leksikal: number;
  entitas: number;
  judul: number;
  lambda: number; // 0 = tanpa MMR, 1 = sangat mendiversifikasi
  perDokumen: number;
}

export const BOBOT_BAWAAN: BobotRerank = {
  sim: 0.42,
  leksikal: 0.26,
  entitas: 0.2,
  judul: 0.12,
  lambda: 0.3,
  perDokumen: 3,
};

const KATA_UMUM = new Set([
  "yang", "untuk", "dari", "dengan", "dalam", "pada", "adalah", "berapa", "bagaimana",
  "apa", "apakah", "dan", "atau", "ini", "itu", "akan", "tidak", "juga", "serta",
  "sebagai", "oleh", "tahun", "menurut", "terhadap", "antara", "dapat", "harus",
]);

export function tokenPenting(teks: string): string[] {
  return (teks.toLowerCase().match(/[a-z0-9,.%]+/g) ?? [])
    .map((t) => t.replace(/[.,%]+$/, ""))
    .filter((t) => t.length >= 4 && !KATA_UMUM.has(t));
}

/** Angka & tahun yang disebut pertanyaan — sinyal kuat untuk dokumen anggaran/target. */
export function entitasAngka(teks: string): string[] {
  const angka = teks.match(/\d[\d.,]*/g) ?? [];
  return [...new Set(angka.map((a) => a.replace(/[.,]$/, "")))].filter((a) => a.length >= 2);
}

function norm(nilai: number, bawah: number, atas: number): number {
  if (!Number.isFinite(nilai)) return 0;
  return Math.max(0, Math.min(1, (nilai - bawah) / (atas - bawah)));
}

/** 0..1: seberapa banyak angka penting pertanyaan muncul di kandidat. */
export function skorEntitas(kueri: string, kandidat: Kandidat): number {
  const angka = entitasAngka(kueri);
  if (angka.length === 0) return 0;
  const isi = `${kandidat.content} ${kandidat.filename ?? ""} ${kandidat.section_title ?? ""}`;
  const kena = angka.filter((a) => isi.includes(a)).length;
  return kena / angka.length;
}

/** 0..1: kecocokan token penting dengan judul dokumen/bagian (bukan isi). */
export function skorJudul(kueri: string, kandidat: Kandidat): number {
  const penting = tokenPenting(kueri);
  if (penting.length === 0) return 0;
  const judul = `${kandidat.filename ?? ""} ${kandidat.section_title ?? ""}`.toLowerCase();
  if (!judul.trim()) return 0;
  const kena = penting.filter((t) => judul.includes(t)).length;
  return kena / penting.length;
}

export function skorKandidat(
  kueri: string,
  kandidat: Kandidat,
  skorLeksikal: number,
  bobot: BobotRerank = BOBOT_BAWAAN,
): number {
  const s = norm(Number(kandidat.sim ?? 0), 0.45, 0.9);
  const l = norm(skorLeksikal, 0, 1);
  const e = skorEntitas(kueri, kandidat);
  const j = skorJudul(kueri, kandidat);

  // Bila pertanyaan tidak memuat angka, bobot entitas dialihkan ke sinyal lain
  // agar skala tetap sebanding antar-jenis pertanyaan.
  const adaAngka = entitasAngka(kueri).length > 0;
  const w = { ...bobot };
  if (!adaAngka) {
    const pindah = w.entitas;
    w.entitas = 0;
    w.sim += pindah * 0.6;
    w.leksikal += pindah * 0.4;
  }
  const total = w.sim + w.leksikal + w.entitas + w.judul || 1;
  return (w.sim * s + w.leksikal * l + w.entitas * e + w.judul * j) / total;
}

/** Kesamaan kasar antar-kandidat untuk MMR (Jaccard token penting). */
function kesamaan(a: string, b: string): number {
  const ta = new Set(tokenPenting(a));
  const tb = new Set(tokenPenting(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let irisan = 0;
  for (const t of ta) if (tb.has(t)) irisan++;
  return irisan / (ta.size + tb.size - irisan);
}

/**
 * Pilih k kandidat: skor tinggi, tidak tumpang tindih (MMR), dan maksimal
 * `perDokumen` chunk dari dokumen yang sama.
 */
export function pilihRerank(
  kandidat: Array<Kandidat & { skorLeksikal?: number; skorAwal?: number }>,
  kueri: string,
  k: number,
  bobot: BobotRerank = BOBOT_BAWAAN,
): Kandidat[] {
  const dinilai = kandidat.map((r) => ({
    r,
    skor: skorKandidat(kueri, r, r.skorLeksikal ?? 0, bobot) + 0.15 * (r.skorAwal ?? 0),
  }));
  dinilai.sort((a, b) => b.skor - a.skor);

  const terpilih: Kandidat[] = [];
  const perDok = new Map<number, number>();

  while (terpilih.length < k && dinilai.length > 0) {
    let terbaikIdx = -1;
    let terbaikNilai = -Infinity;

    for (let i = 0; i < dinilai.length; i++) {
      const { r, skor } = dinilai[i];
      const dok = Number(r.document_id ?? r.id);
      if ((perDok.get(dok) ?? 0) >= bobot.perDokumen) continue;
      const mirip = terpilih.reduce((maks, t) => Math.max(maks, kesamaan(t.content, r.content)), 0);
      const nilai = (1 - bobot.lambda) * skor - bobot.lambda * mirip;
      if (nilai > terbaikNilai) {
        terbaikNilai = nilai;
        terbaikIdx = i;
      }
    }

    if (terbaikIdx === -1) break;
    const dipilih = dinilai.splice(terbaikIdx, 1)[0].r;
    const dok = Number(dipilih.document_id ?? dipilih.id);
    perDok.set(dok, (perDok.get(dok) ?? 0) + 1);
    terpilih.push(dipilih);
  }

  return terpilih;
}
