/**
 * Bangkitkan set evaluasi retrieval dari korpus nyata.
 *
 * Untuk tiap dokumen diambil satu chunk, lalu LLM menulis SATU pertanyaan yang
 * jawabannya hanya ada di chunk itu + jawaban singkatnya. Dokumen sumber
 * menjadi kunci kebenaran → metrik retrieval bisa diukur tanpa LLM.
 *
 * Pakai: bun scripts/generate-eval-set.ts --jumlah 100
 */
import OpenAI from "openai";
import { pool } from "../src/db";
import { config } from "../src/config";

function argAngka(nama: string, bawaan: number): number {
  const i = process.argv.indexOf(nama);
  const v = i >= 0 ? Number(process.argv[i + 1]) : NaN;
  return Number.isFinite(v) && v > 0 ? v : bawaan;
}

interface Baris {
  chunk_id: number;
  document_id: number;
  filename: string;
  content: string;
}

async function main() {
  const jumlah = argAngka("--jumlah", 100);
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

  const client = new OpenAI({ apiKey: config.openaiApiKey });
  let masuk = 0;
  let gagal = 0;

  for (const r of rows) {
    const prompt = `Kutipan dokumen resmi Bappenas:
"""
${r.content.slice(0, 1500)}
"""

Tugas: buat SATU pertanyaan bahasa Indonesia (maks 20 kata) yang jawabannya HANYA bisa diperoleh dari kutipan di atas, dan tuliskan jawaban singkatnya (maks 6 kata).
Pertanyaan harus wajar ditanyakan Menteri/Eselon 1, bukan menyalin kalimat kutipan.
Balas JSON: {"pertanyaan": "...", "jawaban": "..."}`;

    try {
      const resp = await client.chat.completions.create({
        model: config.openaiModel,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      });
      const isi = JSON.parse(resp.choices[0]?.message?.content ?? "{}") as {
        pertanyaan?: string;
        jawaban?: string;
      };
      if (!isi.pertanyaan || !isi.jawaban) throw new Error("jawaban model tidak lengkap");

      await pool.query(
        `INSERT INTO retrieval_cases (pertanyaan, jawaban, dokumen_id, chunk_id)
         VALUES ($1,$2,$3,$4) ON CONFLICT (pertanyaan) DO NOTHING`,
        [isi.pertanyaan.trim(), isi.jawaban.trim(), r.document_id, r.chunk_id],
      );
      masuk++;
      if (masuk % 10 === 0) console.log(`[eval-set] ${masuk} kasus tersimpan`);
    } catch (e) {
      gagal++;
      console.warn(`[eval-set] gagal (doc ${r.document_id}): ${(e as Error).message}`);
    }
  }

  const total = await pool.query("SELECT count(*)::int AS n FROM retrieval_cases WHERE aktif");
  console.log(`[eval-set] selesai — baru: ${masuk}, gagal: ${gagal}, total aktif: ${total.rows[0].n}`);
  await pool.end();
}

if (import.meta.main) {
  main().catch(async (e) => {
    console.error(e);
    await pool.end().catch(() => {});
    process.exit(1);
  });
}
