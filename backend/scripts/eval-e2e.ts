/**
 * Harness end-to-end berbasis korpus.
 *
 * Berbeda dari eval-playground (34 kasus kurasi tangan, 12 inti), harness ini
 * memakai `retrieval_cases` — pertanyaan yang dibangkitkan dari chunk asli dan
 * HANYA diterima bila jawabannya verbatim ada di chunk tersebut. Jumlahnya bisa
 * ratusan sehingga satu kasus tidak lagi bernilai 8 poin.
 *
 * Penilaian:
 *  - BENAR-SITASI-BENAR : jawaban memuat fakta & menyitasi dokumen sumber
 *  - BENAR-TANPA-SITASI : fakta muncul, dokumen sumber tidak disitasi
 *  - TIDAK-LENGKAP      : fakta tidak muncul, tetapi sistem menjawab
 *  - MENOLAK            : sistem menolak padahal fakta ada di korpus
 *
 * Pakai:
 *   bun scripts/eval-e2e.ts --batas 100
 */
import { pool } from "../src/db";
import { config } from "../src/config";
import { ask } from "../src/services/rag";
import { nilaiDenganJuri } from "../src/lib/judge";

const argv = process.argv.slice(2);
const ambil = (nama: string, bawaan: string) => {
  const i = argv.indexOf(nama);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : bawaan;
};

const batas = Number(ambil("--batas", "100"));
const pakaiJuri = argv.includes("--juri");

export function normalisasi(t: string): string {
  return t
    .toLowerCase()
    .replace(/[^a-z0-9,.\s%]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[.,]+$/, "")
    .trim();
}

export function nilaiKasus(
  jawaban: string,
  menolak: boolean,
  dokumenSitasi: number[],
  fakta: string,
  dokumenSumber: number,
): "BENAR-SITASI-BENAR" | "BENAR-TANPA-SITASI" | "TIDAK-LENGKAP" | "MENOLAK" {
  if (menolak) return "MENOLAK";
  const adaFakta = normalisasi(jawaban).includes(normalisasi(fakta));
  const sitasiBenar = dokumenSitasi.some((d) => Number(d) === Number(dokumenSumber));
  if (adaFakta && sitasiBenar) return "BENAR-SITASI-BENAR";
  if (adaFakta) return "BENAR-TANPA-SITASI";
  return "TIDAK-LENGKAP";
}

async function main() {
  const { rows } = await pool.query(
    `SELECT id, pertanyaan, jawaban AS fakta, dokumen_id
       FROM retrieval_cases
      WHERE aktif
      ORDER BY id
      LIMIT $1`,
    [batas],
  );
  const kasus = rows as Array<{ id: number; pertanyaan: string; fakta: string; dokumen_id: number }>;
  console.log(`[e2e] ${kasus.length} kasus | embed=${config.ragEmbedKolom} | vectorK=${config.vectorK}`);

  const hitung: Record<string, number> = {
    "BENAR-SITASI-BENAR": 0,
    "BENAR-TANPA-SITASI": 0,
    "TIDAK-LENGKAP": 0,
    MENOLAK: 0,
  };
  const detik: number[] = [];
  let sitasiBenar = 0;
  let menjawab = 0;
  const juriJumlah = { faithfulness: 0, relevancy: 0, recall: 0 };
  let juriKasus = 0;

  for (let i = 0; i < kasus.length; i++) {
    const k = kasus[i];
    const mulai = Date.now();
    let hasil: any;
    try {
      hasil = await ask(k.pertanyaan);
    } catch (err) {
      console.log(`  ${k.id} ERROR ${String(err).slice(0, 80)}`);
      continue;
    }
    detik.push((Date.now() - mulai) / 1000);
    const dokSitasi = (hasil.citations ?? []).map((c: any) => Number(c.document_id));
    const putusan = nilaiKasus(hasil.answer ?? "", Boolean(hasil.menolak), dokSitasi, k.fakta, k.dokumen_id);
    hitung[putusan] = (hitung[putusan] ?? 0) + 1;
    if (!hasil.menolak) menjawab++;
    if (pakaiJuri) {
      const skor = await nilaiDenganJuri(k.pertanyaan, k.fakta, hasil.context ?? "", hasil.answer ?? "");
      if (skor) {
        juriJumlah.faithfulness += skor.faithfulness;
        juriJumlah.relevancy += skor.relevancy;
        juriJumlah.recall += skor.recall;
        juriKasus++;
      }
    }
    if (dokSitasi.some((d: number) => d === Number(k.dokumen_id))) sitasiBenar++;
    if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${kasus.length}…`);
  }

  const total = Object.values(hitung).reduce((a, b) => a + b, 0);
  const pct = (n: number) => (total ? Number(((n / total) * 100).toFixed(1)) : 0);
  const urut = [...detik].sort((a, b) => a - b);
  const p = (q: number) => (urut.length ? Number(urut[Math.min(urut.length - 1, Math.floor(q * urut.length))].toFixed(2)) : 0);

  const agregat = {
    total,
    benar_sitasi_benar: hitung["BENAR-SITASI-BENAR"],
    benar_tanpa_sitasi: hitung["BENAR-TANPA-SITASI"],
    tidak_lengkap: hitung["TIDAK-LENGKAP"],
    menolak: hitung["MENOLAK"],
    akurasi_fakta_persen: pct(hitung["BENAR-SITASI-BENAR"] + hitung["BENAR-TANPA-SITASI"]),
    benar_sitasi_benar_persen: pct(hitung["BENAR-SITASI-BENAR"]),
    sitasi_benar_persen: pct(sitasiBenar),
    menolak_padahal_ada_persen: pct(hitung["MENOLAK"]),
    latensi_p50: p(0.5),
    latensi_p95: p(0.95),
    menjawab,
    ...(juriKasus > 0
      ? {
          juri_kasus: juriKasus,
          juri_faithfulness: Number((juriJumlah.faithfulness / juriKasus).toFixed(3)),
          juri_relevancy: Number((juriJumlah.relevancy / juriKasus).toFixed(3)),
          juri_recall: Number((juriJumlah.recall / juriKasus).toFixed(3)),
        }
      : {}),
  };

  console.log("\n=== HASIL ===");
  console.log(JSON.stringify(agregat, null, 2));

  await pool.query(
    `INSERT INTO e2e_runs (jumlah_kasus, konfigurasi, agregat) VALUES ($1, $2, $3)`,
    [
      total,
      JSON.stringify({
        embed: config.ragEmbedKolom,
        vectorK: config.vectorK,
        rerank: config.ragRerank,
        docLevel: config.ragDocLevel,
        model: config.openaiModel,
      }),
      JSON.stringify(agregat),
    ],
  );
  await pool.end();
}

if (import.meta.main) await main();
