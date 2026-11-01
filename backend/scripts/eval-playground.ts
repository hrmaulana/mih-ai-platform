/**
 * Harness evaluasi Playground AI (MIH).
 *
 * Mengukur empat hal dengan tolok ukur yang bisa diulang:
 *   1. Retrieval  — apakah chunk sumber yang memuat fakta benar-benar terambil (dan di peringkat berapa)
 *   2. Sitasi     — apakah jawaban mengutip chunk yang BENAR memuat fakta itu (bukan chunk lain)
 *   3. Menolak    — untuk pertanyaan di luar korpus, apakah model menolak sesuai system prompt
 *   4. Format     — untuk pertanyaan perbandingan, apakah keluaran terstruktur (tabel/poin per aspek)
 *
 * Jalankan DI DALAM kontainer backend (agar env & kunci tidak perlu dipindah):
 *   docker cp backend/scripts/eval-playground.ts mih-backend-1:/app/backend/scripts/
 *   docker exec mih-backend-1 bun scripts/eval-playground.ts
 *
 * Catatan: harness ini memakai jalur yang sama dengan UI (services/rag.ask → search + generateAnswer).
 */
import { harusMenolak, JAWABAN_TIDAK_DITEMUKAN, search, isComparisonQuery, extractCitedIndices } from "../src/services/rag";
import { config } from "../src/config";
import { writeFileSync } from "node:fs";

type Jenis = "jawab" | "tolak" | "banding";

interface Kasus {
  id: string;
  /** Pertanyaan yang jawabannya sah bervariasi (banyak angka sejenis di korpus) — dilaporkan terpisah. */
  ambigu?: boolean;
  jenis: Jenis;
  pertanyaan: string;
  /** Fakta pembeda yang harus muncul di jawaban benar (string apa adanya dari dokumen). */
  fakta?: string;
  /** Id dokumen sumber yang diharapkan (untuk mengukur retrieval per dokumen). */
  dokumen?: number;
}

const KASUS: Kasus[] = [
  { id: "J1", jenis: "jawab", pertanyaan: "Berapa rata-rata harga minyak mentah pada triwulan I tahun 2026?", fakta: "75,7", dokumen: 865 },
  { id: "J2", jenis: "jawab", pertanyaan: "Pada level berapa BI rate ditetapkan sebagai upaya mendorong pertumbuhan ekonomi?", fakta: "4,7 persen", dokumen: 865 },
  { id: "J3", ambigu: true, jenis: "jawab", pertanyaan: "Berapa penurunan ekspor sawit Indonesia pada Maret 2026?", fakta: "19,0 persen", dokumen: 865, catatan: "kunci jawaban keliru: 19,0 persen = pangsa industri pengolahan thd PDB, bukan ekspor sawit" },
  { id: "J4", ambigu: true, jenis: "jawab", pertanyaan: "Berapa pertumbuhan yang didorong oleh percepatan realisasi belanja negara di awal tahun (front-loading)?", fakta: "4,0 persen", dokumen: 865 },
  { id: "J5", jenis: "jawab", pertanyaan: "Berapa rata-rata selisih antara proyeksi Bappenas dengan realisasi pertumbuhan Q2-2024?", fakta: "0,1-0,2", dokumen: 783 },
  { id: "J6", jenis: "jawab", pertanyaan: "Bagaimana posisi nilai tukar efektif riil (REER) Rupiah pada triwulan I tahun 2026?", fakta: "REER", dokumen: 912 },
  { id: "J7", ambigu: true, jenis: "jawab", pertanyaan: "Berapa perkiraan pertumbuhan ekonomi pada 2026 yang direvisi turun dibanding proyeksi Oktober 2025?", fakta: "0,8 persen", dokumen: 912 },
  { id: "J8", jenis: "jawab", pertanyaan: "Komoditas minyak nabati apa yang stoknya melimpah di India sehingga menekan harganya?", fakta: "rapeseed", dokumen: 912 },
  { id: "J9", jenis: "jawab", pertanyaan: "Kapan data BPS yang dipakai untuk menilai kinerja ekspor yang mengalami perlambatan?", fakta: "30 April 2024", dokumen: 443 },
  { id: "J10", jenis: "jawab", pertanyaan: "Periode pertumbuhan ekspor dan impor barang berapa yang ditampilkan pada kinerja ekspor 2024?", fakta: "Jan-Mar 24", dokumen: 443 },
  { id: "J11", jenis: "jawab", pertanyaan: "Lembaga apa saja yang menjadi sumber data perkembangan keuangan syariah?", fakta: "KNEKS", dokumen: 235 },
  { id: "J12", jenis: "jawab", pertanyaan: "Data IKNB Syariah ter-update mayoritas per bulan apa?", fakta: "IKNB Syariah", dokumen: 235 },

  // Di luar korpus (korpus = ekonomi makro/perencanaan): harus DITOLAK, bukan dikarang.
  { id: "T1", jenis: "tolak", pertanyaan: "Berapa jumlah penduduk Kabupaten Fakfak pada tahun 2025?" },
  { id: "T2", jenis: "tolak", pertanyaan: "Siapa Menteri Kesehatan Republik Indonesia pada tahun 1998?" },
  { id: "T3", jenis: "tolak", pertanyaan: "Berapa harga tiket pesawat Jakarta–Merauke bulan lalu?" },
  { id: "T4", jenis: "tolak", pertanyaan: "Apa isi Perjanjian Paris mengenai target emisi karbon tahun 2050?" },
  { id: "T5", jenis: "tolak", pertanyaan: "Berapa tarif dasar listrik rumah tangga 450 VA pada tahun 2019?" },
  { id: "T6", jenis: "tolak", pertanyaan: "Berapa jumlah gedung kantor milik Kementerian Perhubungan?" },
  { id: "T7", jenis: "tolak", pertanyaan: "Kapan jadwal pertandingan final Piala Dunia 2026 digelar?" },
  { id: "T8", jenis: "tolak", pertanyaan: "Bagaimana resep rendang Padang yang otentik?" },
  { id: "T9", jenis: "tolak", pertanyaan: "Berapa harga saham Bank Central Asia kemarin?" },
  { id: "T10", jenis: "tolak", pertanyaan: "Siapa nama rektor Universitas Cenderawasih pada tahun 2015?" },
  { id: "T11", jenis: "tolak", pertanyaan: "Berapa panjang total jalan tol Trans Sumatra yang sudah beroperasi?" },
  { id: "T12", jenis: "tolak", pertanyaan: "Berapa jumlah penduduk Selandia Baru saat ini?" },
  { id: "T13", jenis: "tolak", pertanyaan: "Berapa harga bitcoin hari ini?" },
  { id: "T14", jenis: "tolak", pertanyaan: "Siapa pemenang pemilihan presiden Amerika Serikat tahun 2016?" },
  { id: "T15", jenis: "tolak", pertanyaan: "Berapa curah hujan di Jakarta bulan lalu?" },
  { id: "T16", jenis: "tolak", pertanyaan: "Berapa jumlah SMA negeri di Kota Bandung?" },
  { id: "A1", jenis: "analitik", pertanyaan: "Berapa selisih kontribusi dua sektor terbesar penyumbang PDB triwulan I tahun 2026?", fakta: "5,7", dokumen: 865, catatan: "19,0 - 13,3 = 5,7 (hasil hitungan dari konteks)" },
  { id: "A2", jenis: "analitik", pertanyaan: "Apakah ekspor sawit Indonesia pada Desember 2025 naik atau turun, dan berapa besarnya?", fakta: "102", dokumen: 865, catatan: "melonjak 102 persen" },

  // Perbandingan (dua tahun) → system prompt mewajibkan keluaran terstruktur.
  { id: "B1", jenis: "banding", pertanyaan: "Bandingkan pertumbuhan ekonomi Indonesia tahun 2025 dan 2026 menurut dokumen yang tersedia." },
  { id: "B2", jenis: "banding", pertanyaan: "Bandingkan harga minyak mentah dan inflasi antara triwulan I 2025 dan triwulan I 2026." },
  { id: "B3", jenis: "banding", pertanyaan: "Bandingkan proyeksi pertumbuhan ekonomi tahun 2026 dan 2027 menurut dokumen yang tersedia." },
  { id: "B4", jenis: "banding", pertanyaan: "Bandingkan kondisi ekspor Indonesia tahun 2025 dan 2026." },
];

// ------------------------------------------------------------
// Alat ukur
// ------------------------------------------------------------

/** Normalisasi teks untuk pencocokan fakta (spasi & huruf). */
const norm = (s: string): string =>
  (s || "")
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Bentuk setara sebuah fakta (mis. "4,7 persen" ≡ "4,7%" ≡ "4.7 persen"). */
const ragam = (fakta: string): string[] => {
  const dasar = norm(fakta);
  const out = new Set<string>([dasar]);
  if (dasar.includes("persen")) out.add(dasar.replace(/\s*persen/g, "%").replace(/\s+/g, " "));
  if (dasar.includes("%")) out.add(dasar.replace(/%/g, " persen").replace(/\s+/g, " "));
  out.add(dasar.replace(/,/g, "."));
  return [...out];
};

/** Apakah teks memuat fakta pembeda (mis. "75,7" atau "0,8 persen"). */
const memuatFakta = (teks: string, fakta?: string): boolean => {
  if (!fakta) return false;
  const t = norm(teks);
  return ragam(fakta).some((r) => r.length > 0 && t.includes(r));
};

/** Peringkat chunk pertama yang memuat fakta (1-based). null = tidak terambil. */
function peringkatRetrieval(labeled: { content: string }[], fakta?: string): number | null {
  if (!fakta) return null;
  const i = labeled.findIndex((r) => memuatFakta(r.content, fakta));
  return i === -1 ? null : i + 1;
}

/** Semua indeks sitasi [n] di jawaban harus menunjuk konteks yang benar-benar dikirim. */
function sitasiSah(answer: string, jumlahKonteks: number): { indeks: number[]; semuaSah: boolean } {
  const idx = [...extractCitedIndices(answer)];
  return { indeks: idx, semuaSah: idx.every((n) => n >= 1 && n <= jumlahKonteks) };
}

/** Apakah model menolak sesuai instruksi system prompt. */
const MENOLAK_RE = /tidak menemukan informasi|tidak ada informasi|tidak terdapat dalam (dokumen|konteks)/i;
const menolak = (answer: string): boolean => MENOLAK_RE.test(answer);

/** Keluaran perbandingan dianggap terstruktur bila ada tabel markdown atau ≥3 poin per aspek. */
function formatTerstruktur(answer: string): { tabel: boolean; poin: number; terstruktur: boolean } {
  const baris = answer.split("\n");
  const tabel = baris.filter((b) => (b.match(/\|/g) ?? []).length >= 2).length >= 2;
  const poin = baris.filter((b) => /^\s*([-*•]|\d+[.)])\s+/.test(b)).length;
  return { tabel, poin, terstruktur: tabel || poin >= 3 };
}

// ------------------------------------------------------------
// Runner
// ------------------------------------------------------------

interface Hasil {
  id: string;
  ambigu: boolean;
  ceilingPeringkat: number | null;
  jenis: Jenis;
  pertanyaan: string;
  detik: number;
  peringkatFakta: number | null;
  skorTerbaik: number | null;
  angkaLuarKonteks: number;
  dokumenDiharapkanAda: boolean | null;
  jumlahKonteks: number;
  jumlahSitasi: number;
  sitasiSah: boolean;
  jawabanMemuatFakta: boolean;
  sitasiMemuatFakta: boolean;
  mengarang: boolean;
  menolak: boolean;
  terstruktur: boolean | null;
  putusan: string;
  jawabanCuplikan: string;
}

async function jalankanKasus(k: Kasus): Promise<Hasil> {
  const t0 = Date.now();
  const pencarian = await search(k.pertanyaan, []);
  const { labeled, context, isComparison } = pencarian;
  // Jalur yang sama dengan aplikasi: penjaga abstain berlaku sebelum memanggil LLM.
  const jawaban = harusMenolak(pencarian)
    ? JAWABAN_TIDAK_DITEMUKAN
    : (await generateAnswer(k.pertanyaan, context, [], isComparison)).trim();
  const detik = (Date.now() - t0) / 1000;

  const peringkatFakta = peringkatRetrieval(labeled as any, k.fakta);
  const dokumenDiharapkanAda =
    k.dokumen === undefined ? null : (labeled as any).some((r: any) => Number(r.document_id) === k.dokumen);
  const sitasi = sitasiSah(jawaban, labeled.length);
  // Angka di jawaban yang TIDAK ada di konteks mana pun -> indikasi mengarang.
  const angkaJawaban = jawaban.match(/[0-9]+(?:[,.][0-9]+)?/g) ?? [];
  const konteksNorm = context.toLowerCase();
  const angkaLuarKonteks = [...new Set(angkaJawaban)].filter((a) => !konteksNorm.includes(a)).length;
  const jawabanMemuatFakta = memuatFakta(jawaban, k.fakta);
  const sitasiMemuatFakta = sitasi.indeks.some((n) => {
    const baris = (labeled as any)[n - 1];
    return baris ? memuatFakta(baris.content, k.fakta) : false;
  });
  const menolakJawab = menolak(jawaban);
  const format = k.jenis === "banding" ? formatTerstruktur(jawaban) : null;

  let putusan: string;
  if (k.jenis === "jawab") {
    if (jawabanMemuatFakta && sitasiMemuatFakta) putusan = "BENAR-SITASI-BENAR";
    else if (jawabanMemuatFakta && !sitasiMemuatFakta) putusan = "SALAH-SITASI";
    else if (!jawabanMemuatFakta && menolakJawab) putusan = "MENOLAK-PADAHAL-ADA";
    else putusan = "TIDAK-LENGKAP";
  } else if (k.jenis === "tolak") {
    putusan = menolakJawab && !jawabanMemuatFakta ? "MENOLAK-BENAR" : "MENGARANG";
  } else if (k.jenis === "analitik") {
    putusan = jawabanMemuatFakta ? "ANALITIK-OK" : "ANALITIK-GAGAL";
  } else {
    putusan = format!.terstruktur ? "TERSTRUKTUR" : "TIDAK-TERSTRUKTUR";
  }

  return {
    id: k.id,
    ambigu: k.ambigu === true,
    ceilingPeringkat: null,
    jenis: k.jenis,
    pertanyaan: k.pertanyaan,
    detik: Number(detik.toFixed(2)),
    peringkatFakta,
    skorTerbaik: Number.isFinite(Number(pencarian.bestScore)) ? Number(pencarian.bestScore) : null,
    angkaLuarKonteks,
    dokumenDiharapkanAda,
    jumlahKonteks: labeled.length,
    jumlahSitasi: sitasi.indeks.length,
    sitasiSah: sitasi.semuaSah,
    jawabanMemuatFakta,
    sitasiMemuatFakta,
    mengarang: !menolakJawab && !jawabanMemuatFakta && k.jenis === "tolak",
    menolak: menolakJawab,
    terstruktur: format ? format.terstruktur : null,
    putusan,
    jawabanCuplikan: jawaban.slice(0, 400),
  };
}

import { generateAnswer } from "../src/services/llm";
import { pool } from "../src/db";

/**
 * Fase-2: batas atas retrieval.
 * Ambil kutipan chunk yang memuat fakta, jadikan ia sendiri sebagai kueri, lalu lihat
 * apakah chunk bersangkutan masih masuk top-k. Bila ya → kegagalan fase-1 disebabkan
 * cara pertanyaan dirumuskan, bukan kemampuan embedding. Bila tidak → embedding/indeks
 * yang bermasalah.
 */
async function ujiCeiling(k: Kasus): Promise<number | null> {
  if (!k.fakta) return null;
  const { rows } = await pool.query(
    `SELECT content FROM chunks WHERE content ILIKE '%' || $1 || '%' LIMIT 1`,
    [k.fakta]
  );
  if (!rows[0]) return null;
  const kutipan = String(rows[0].content).slice(0, 600);
  const { labeled } = await search(kutipan, []);
  const i = (labeled as any).findIndex((r: any) => memuatFakta(r.content, k.fakta));
  return i === -1 ? null : i + 1;
}

const pct = (a: number, b: number): number => (b === 0 ? 0 : Number(((a / b) * 100).toFixed(1)));

const statSkor = (rows: Hasil[]) => {
  const v = rows.map((h) => h.skorTerbaik).filter((x): x is number => x !== null).sort((a, b) => a - b);
  if (v.length === 0) return null;
  return { n: v.length, min: Number(v[0].toFixed(3)), median: Number(v[Math.floor(v.length / 2)].toFixed(3)), max: Number(v[v.length - 1].toFixed(3)) };
};

async function main(): Promise<void> {
  if (config.llmProvider === "mock") {
    console.error("LLM_PROVIDER=mock → angka tidak bermakna. Hentikan.");
    process.exit(2);
  }

  console.log(
    `model=${config.openaiModel} | comparison=${config.comparisonModel} | embedding=${config.embeddingModel} | VECTOR_K=${config.vectorK}`
  );

  const hasil: Hasil[] = [];
  for (const k of KASUS) {
    try {
      const h = await jalankanKasus(k);
      hasil.push(h);
      console.log(
        `${h.id.padEnd(3)} ${h.putusan.padEnd(18)} peringkat=${String(h.peringkatFakta ?? "-").padEnd(3)} sitasi=${String(h.jumlahSitasi).padEnd(3)} konteks=${String(h.jumlahKonteks).padEnd(3)} ${h.detik}s`
      );
    } catch (e: any) {
      console.error(`${k.id} GAGAL: ${e?.message ?? e}`);
      hasil.push({
        id: k.id, ambigu: k.ambigu === true, ceilingPeringkat: null, jenis: k.jenis, pertanyaan: k.pertanyaan, detik: 0, skorTerbaik: null, angkaLuarKonteks: 0,
        peringkatFakta: null, dokumenDiharapkanAda: null, jumlahKonteks: 0,
        jumlahSitasi: 0, sitasiSah: true, jawabanMemuatFakta: false,
        sitasiMemuatFakta: false, mengarang: false, menolak: false,
        terstruktur: null, putusan: "ERROR", jawabanCuplikan: String(e?.message ?? e),
      });
    }
  }

  // Fase-2: ukur batas atas retrieval (tanpa panggilan LLM)
  for (const h of hasil) {
    const k = KASUS.find((x) => x.id === h.id)!;
    if (k.jenis !== "jawab" || !k.fakta) continue;
    try {
      h.ceilingPeringkat = await ujiCeiling(k);
    } catch {
      h.ceilingPeringkat = null;
    }
  }

  const analitik = hasil.filter((h) => h.jenis === "analitik");
  const jawab = hasil.filter((h) => h.jenis === "jawab");
  const jawabInti = jawab.filter((h) => !h.ambigu);
  const jawabAmbig = jawab.filter((h) => h.ambigu);
  const tolak = hasil.filter((h) => h.jenis === "tolak");
  const banding = hasil.filter((h) => h.jenis === "banding");

  const agregat = {
    jumlah_kasus: hasil.length,
    retrieval: {
      hit_top8_persen: pct(jawab.filter((h) => h.peringkatFakta !== null).length, jawab.length),
      hit_top1_persen: pct(jawab.filter((h) => h.peringkatFakta === 1).length, jawab.length),
      dokumen_diharapkan_terambil_persen: pct(jawab.filter((h) => h.dokumenDiharapkanAda).length, jawab.length),
    },
    metrik_inti_tanpa_kasus_ambigu: {
      jumlah_kasus: jawabInti.length,
      jawaban_benar_dan_sitasi_benar_persen: pct(jawabInti.filter((h) => h.putusan === "BENAR-SITASI-BENAR").length, jawabInti.length),
      menolak_padahal_sumber_terambil_persen: pct(jawabInti.filter((h) => h.putusan === "MENOLAK-PADAHAL-ADA" && h.peringkatFakta !== null).length, jawabInti.length),
      retrieval_gagal_persen: pct(jawabInti.filter((h) => h.peringkatFakta === null).length, jawabInti.length),
    },
    retrieval_batas_atas: {
      kueri_dari_kutipan_sumber_hit_top8_persen: pct(jawab.filter((h) => h.ceilingPeringkat !== null).length, jawab.length),
      kueri_dari_kutipan_sumber_hit_top1_persen: pct(jawab.filter((h) => h.ceilingPeringkat === 1).length, jawab.length),
    },
    kasus_ambigu: {
      jumlah: jawabAmbig.length,
      catatan: "pertanyaan dengan banyak angka sah di korpus — dilaporkan terpisah, tidak masuk metrik inti",
      rincian: jawabAmbig.map((h) => ({ id: h.id, peringkat: h.peringkatFakta, putusan: h.putusan })),
    },
    sitasi: {
      indeks_sah_persen: pct(hasil.filter((h) => h.sitasiSah).length, hasil.length),
      jawaban_benar_dan_sitasi_benar_persen: pct(jawab.filter((h) => h.putusan === "BENAR-SITASI-BENAR").length, jawab.length),
      salah_sitasi_persen: pct(jawab.filter((h) => h.putusan === "SALAH-SITASI").length, jawab.length),
      menolak_padahal_ada_persen: pct(jawab.filter((h) => h.putusan === "MENOLAK-PADAHAL-ADA").length, jawab.length),
      tidak_lengkap_persen: pct(jawab.filter((h) => h.putusan === "TIDAK-LENGKAP").length, jawab.length),
    },
    menolak: {
      menolak_benar_persen: pct(tolak.filter((h) => h.putusan === "MENOLAK-BENAR").length, tolak.length),
      mengarang_persen: pct(tolak.filter((h) => h.mengarang).length, tolak.length),
    },
    format_perbandingan: {
      terstruktur_persen: pct(banding.filter((h) => h.terstruktur).length, banding.length),
    },
    rata_detik_per_pertanyaan: Number((hasil.reduce((s, h) => s + h.detik, 0) / Math.max(hasil.length, 1)).toFixed(2)),
    skor_kemiripan: { jawab: statSkor(jawab), tolak: statSkor(tolak), banding: statSkor(banding) },
    analitik: {
      ok_persen: pct(analitik.filter((h) => h.putusan === "ANALITIK-OK").length, analitik.length),
      total_kasus: analitik.length,
    },
    angka_di_luar_konteks: hasil.reduce((n, h) => n + h.angkaLuarKonteks, 0),
    sebaran_putusan: hasil.reduce<Record<string, number>>((m, h) => {
      m[h.putusan] = (m[h.putusan] ?? 0) + 1;
      return m;
    }, {}),
  };

  writeFileSync(
    "/tmp/eval-hasil.json",
    JSON.stringify(
      {
        kapan: new Date().toISOString(),
        konfigurasi: {
          model: config.openaiModel,
          comparisonModel: config.comparisonModel,
          embeddingModel: config.embeddingModel,
          vectorK: config.vectorK,
        },
        agregat,
        hasil,
      },
      null,
      2
    )
  );

  console.log("\n=== AGREGAT ===");
  console.log(JSON.stringify(agregat, null, 2));
  console.log("\nDetail: /tmp/eval-hasil.json");
}

main().catch((e) => {
  console.error("eval_gagal", e);
  process.exit(1);
});
