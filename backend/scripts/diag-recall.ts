/**
 * Diagnostik gap recall: di peringkat berapa fakta yang diharapkan muncul?
 *
 * Membandingkan posisi chunk yang memuat fakta pada kandidat vektor top-45
 * versus yang akhirnya dipakai (top-8). Menjawab: apakah masalahnya di
 * pemilihan (fakta ada di 9-45) atau di representasi (fakta tak pernah muncul).
 */
import { pool } from "../src/db";
import { config } from "../src/config";
import { embedM3 } from "../src/services/embed-m3";
import { embedTexts } from "../src/services/embeddings";

const argBatas = process.argv.indexOf("--batas");
const batas = argBatas >= 0 ? Number(process.argv[argBatas + 1]) : 60;

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9,%.\s]/g, " ").replace(/\s+/g, " ").trim();

async function main() {
  const { rows: kasus } = await pool.query<{ pertanyaan: string; jawaban: string }>(
    `SELECT pertanyaan, jawaban FROM retrieval_cases WHERE aktif ORDER BY id LIMIT $1`,
    [batas],
  );
  const pakaiM3 = config.ragEmbedKolom === "m3";
  const kolom = pakaiM3 ? "c.embedding_m3" : "c.embedding";

  const ember = { top8: 0, top12: 0, top24: 0, top45: 0, hilang: 0, adaDiKorpus: 0 };

  for (const k of kasus) {
    const [v] = pakaiM3 ? await embedM3([k.pertanyaan]) : await embedTexts([k.pertanyaan]);
    const { rows } = await pool.query<{ content: string }>(
      `SELECT c.content FROM chunks c
        WHERE c.is_outdated = FALSE AND ${kolom} IS NOT NULL
        ORDER BY ${kolom} <=> $1::halfvec LIMIT 45`,
      [JSON.stringify(v)],
    );
    const fakta = norm(k.jawaban);
    const idx = rows.findIndex((r) => norm(r.content).includes(fakta));
    if (idx < 0) {
      ember.hilang++;
      // Apakah fakta ada di korpus sama sekali? (memisahkan label salah vs ranking)
      const { rows: cek } = await pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM chunks WHERE is_outdated = FALSE AND lower(content) LIKE $1`,
        [`%${k.jawaban.toLowerCase()}%`],
      );
      if ((cek[0]?.n ?? 0) > 0) ember.adaDiKorpus++;
    }
    else if (idx < 8) ember.top8++;
    else if (idx < 12) ember.top12++;
    else if (idx < 24) ember.top24++;
    else ember.top45++;
  }

  const n = kasus.length;
  const persen = (x: number) => `${((100 * x) / n).toFixed(1)}%`;
  console.log(`[diag] ${n} kasus | embed=${config.ragEmbedKolom}`);
  console.log(`  fakta di top-8   : ${ember.top8} (${persen(ember.top8)})`);
  console.log(`  fakta di 9-11    : ${ember.top12} (${persen(ember.top12)})`);
  console.log(`  fakta di 12-23   : ${ember.top24} (${persen(ember.top24)})`);
  console.log(`  fakta di 24-44   : ${ember.top45} (${persen(ember.top45)})`);
  console.log(`  fakta TIDAK ada  : ${ember.hilang} (${persen(ember.hilang)})`);
  console.log(`    └ ada di korpus (masalah ranking): ${ember.adaDiKorpus}`);
  console.log(`    └ benar-benar tak ada (label/format): ${ember.hilang - ember.adaDiKorpus}`);
  await pool.end();
}

await main();
