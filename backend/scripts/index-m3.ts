/**
 * Indeksasi embedding bge-m3 (1024 dim) untuk chunk yang belum punya.
 *
 * Dijalankan di backend container (punya @huggingface/transformers + model di
 * /data/models/bge-m3). Menulis ke kolom terpisah `embedding_m3`, jadi kolom
 * lama tidak tersentuh dan rollback cukup ganti RAG_EMBED_KOLOM.
 *
 * Pakai:
 *   bun scripts/index-m3.ts --dokumen 344,235      (dokumen tertentu)
 *   bun scripts/index-m3.ts --batas 20            (20 dokumen pertama)
 *   bun scripts/index-m3.ts --semua               (seluruh korpus, ±2 jam)
 */
import { pool } from "../src/db";
import { embedM3 } from "../src/services/embed-m3";

const argv = process.argv.slice(2);
const nilai = (nama: string) => {
  const i = argv.indexOf(nama);
  return i >= 0 ? argv[i + 1] : undefined;
};

async function main() {
  const dokArg = nilai("--dokumen");
  const batas = Number(nilai("--batas") ?? "0");
  const semua = argv.includes("--semua");

  let filter = "";
  const params: any[] = [];
  if (dokArg) {
    const ids = dokArg.split(",").map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n > 0);
    filter = "AND c.document_id = ANY($1::bigint[])";
    params.push(ids);
  } else if (!semua && batas > 0) {
    filter = `AND c.document_id IN (SELECT id FROM documents WHERE status='completed' ORDER BY id LIMIT ${batas})`;
  }

  const { rows } = await pool.query(
    `SELECT c.id, c.content, c.section_title
       FROM chunks c JOIN documents d ON d.id = c.document_id
      WHERE c.is_outdated = FALSE AND d.status = 'completed'
        AND c.embedding_m3 IS NULL ${filter}
      ORDER BY c.id`,
    params,
  );
  const total = rows.length;
  console.log(`[m3] ${total} chunk perlu diindeks`);
  if (total === 0) {
    await pool.end();
    return;
  }

  const mulai = Date.now();
  let selesai = 0;
  const ukuran = 16;
  for (let i = 0; i < rows.length; i += ukuran) {
    const bagian = rows.slice(i, i + ukuran) as Array<{ id: number; content: string; section_title: string | null }>;
    const teks = bagian.map((c) => (c.section_title ? `${c.section_title}\n${c.content}` : c.content));
    const vektor = await embedM3(teks);
    for (let j = 0; j < bagian.length; j++) {
      await pool.query("UPDATE chunks SET embedding_m3 = $2::halfvec WHERE id = $1", [
        bagian[j].id,
        JSON.stringify(vektor[j]),
      ]);
    }
    selesai += bagian.length;
    if (selesai % 160 === 0 || selesai === total) {
      const detik = (Date.now() - mulai) / 1000;
      const sisa = ((total - selesai) / (selesai / detik)) / 60;
      console.log(`  ${selesai}/${total} · ${(selesai / detik).toFixed(1)} chunk/s · sisa ${sisa.toFixed(0)} menit`);
    }
  }
  console.log(`[m3] selesai ${selesai} chunk dalam ${((Date.now() - mulai) / 60000).toFixed(1)} menit`);
  await pool.end();
}

if (import.meta.main) await main();
