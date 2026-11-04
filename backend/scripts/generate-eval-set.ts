/**
 * Bangkitkan set evaluasi retrieval dari korpus nyata.
 *
 * Untuk tiap dokumen diambil satu chunk, lalu LLM menulis SATU pertanyaan yang
 * jawabannya hanya ada di chunk itu. **Jawaban wajib berupa kutipan persis**
 * dari chunk (divalidasi di sini, bukan dipercaya begitu saja) — tanpa ini
 * sekitar separuh kasus berisi parafrase dan metriknya tidak bisa dipercaya.
 *
 * Pakai:
 *   bun scripts/generate-eval-set.ts --jumlah 100
 *   bun scripts/generate-eval-set.ts --bersihkan      # buang kasus non-verbatim
 */
import OpenAI from "openai";
import { pool } from "../src/db";
import { config } from "../src/config";

function argAngka(nama: string, bawaan: number): number {
  const i = process.argv.indexOf(nama);
  const v = i >= 0 ? Number(process.argv[i + 1]) : NaN;
  return Number.isFinite(v) && v > 0 ? v : bawaan;
}

/** Normalisasi untuk perbandingan: spasi rapat, huruf kecil, buang tanda kutip. */
export function normalisasi(teks: string): string {
  return teks
    .toLowerCase()
    .replace(/[“”"'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Jawaban harus muncul apa adanya di dalam chunk. */
export function verbatim(isiChunk: string, jawaban: string): boolean {
  const j = normalisasi(jawaban);
  if (j.length < 3) return false;
  return normalisasi(isiChunk).includes(j);
}

interface Baris {
  chunk_id: number;
  document_id: number;
  filename: string;
  content: string;
}

const PROMPT = (isi: string, tegas: boolean) => `Kutipan dokumen resmi Bappenas:
"""
${isi.slice(0, 1500)}
"""

Tugas: buat SATU pertanyaan bahasa Indonesia (maks 20 kata) yang jawabannya HANYA bisa diperoleh dari kutipan di atas, dan tentukan jawabannya.
ATURAN JAWABAN: jawaban harus POTONGAN PERSIS dari kutipan (salin apa adanya, maks 10 kata). Jangan memparafrase, jangan menerjemahkan, jangan menambah kata.
${tegas ? "PERINGATAN: jawaban sebelumnya tidak ditemukan persis di kutipan. Salin ulang karakter demi karakter dari kutipan." : ""}
Balas JSON: {"pertanyaan": "...", "jawaban": "..."}`;

async function main() {
  const jumlah = argAngka("--jumlah", 100);
  const bersihkan = process.argv.includes("--bersihkan");
  const client = new OpenAI({ apiKey: config.openaiApiKey });

  if (bersihkan) {
    const semua = await pool.query<{ id: number; jawaban: string; isi: string }>(
      `SELECT rc.id, rc.jawaban, c.content AS isi
         FROM retrieval_cases rc LEFT JOIN chunks c ON c.id = rc.chunk_id
        WHERE rc.aktif`,
    );
    const buang = semua.rows.filter((r) => !r.isi || !verbatim(r.isi, r.jawaban)).map((r) => r.id);
    if (buang.length) {
      await pool.query("DELETE FROM retrieval_cases WHERE id = ANY($1::bigint[])", [buang]);
    }
    console.log(`[eval-set] dibersihkan: ${buang.length} kasus non-verbatim, sisa ${semua.rows.length - buang.length}`);
  }

  const { rows } = await pool.query<Baris>(
    `SELECT DISTINCT ON (c.document_id)
            c.id AS chunk_id, c.document_id, d.filename, c.content
       FROM chunks c
       JOIN documents d ON d.id = c.document_id
      WHERE d.status = 'completed' AND c.is_outdated = FALSE
        AND length(c.content) BETWEEN 400 AND 1800
      ORDER BY c.document_id, random()
      LIMIT $1`,
    [jumlah],
  );
  console.log(`[eval-set] kandidat dokumen: ${rows.length}`);

  let masuk = 0;
  let ditolak = 0;
  let gagal = 0;

  for (const r of rows) {
    let diterima = false;
    for (let coba = 0; coba < 2 && !diterima; coba++) {
      try {
        const resp = await client.chat.completions.create({
          model: config.openaiModel,
          temperature: coba === 0 ? 0.2 : 0,
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: PROMPT(r.content, coba > 0) }],
        });
        const isi = JSON.parse(resp.choices[0]?.message?.content ?? "{}") as {
          pertanyaan?: string;
          jawaban?: string;
        };
        const pertanyaan = (isi.pertanyaan ?? "").trim();
        const jawaban = (isi.jawaban ?? "").trim();
        if (!pertanyaan || !jawaban) continue;
        if (!verbatim(r.content, jawaban)) continue;

        await pool.query(
          `INSERT INTO retrieval_cases (pertanyaan, jawaban, dokumen_id, chunk_id)
           VALUES ($1,$2,$3,$4) ON CONFLICT (pertanyaan) DO NOTHING`,
          [pertanyaan, jawaban, r.document_id, r.chunk_id],
        );
        diterima = true;
        masuk++;
        if (masuk % 10 === 0) console.log(`[eval-set] ${masuk} kasus valid tersimpan`);
      } catch (e) {
        gagal++;
        console.warn(`[eval-set] gagal (doc ${r.document_id}): ${(e as Error).message}`);
      }
    }
    if (!diterima) ditolak++;
  }

  const total = await pool.query("SELECT count(*)::int AS n FROM retrieval_cases WHERE aktif");
  console.log(`[eval-set] selesai — valid: ${masuk}, ditolak (non-verbatim): ${ditolak}, galat: ${gagal}`);
  console.log(`[eval-set] total aktif: ${total.rows[0].n}`);
  await pool.end();
}

if (import.meta.main) {
  main().catch(async (e) => {
    console.error(e);
    await pool.end().catch(() => {});
    process.exit(1);
  });
}
