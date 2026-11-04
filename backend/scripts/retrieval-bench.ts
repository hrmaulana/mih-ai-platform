/**
 * Benchmark retrieval — TANPA LLM. Mengukur hit@1, hit@8, dan MRR atas
 * `retrieval_cases` (pertanyaan → dokumen sumber yang benar).
 *
 * Pakai:
 *   bun scripts/retrieval-bench.ts                 # konfigurasi aktif
 *   bun scripts/retrieval-bench.ts --grid          # sapu beberapa bobot rerank
 *   bun scripts/retrieval-bench.ts --grid --batas 40
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { pool } from "../src/db";

/**
 * Cache embedding di disk. Sapuan bobot memanggil ulang kueri yang sama;
 * tanpa cache, satu sapuan = ratusan panggilan API dan berjam-jam.
 * Cache hanya menyimpan respons /embeddings — bukan data pengguna.
 */
const CACHE_PATH = process.env.BENCH_CACHE ?? "/tmp/mih-embed-cache.json";
const cacheEmbed: Record<string, string> = existsSync(CACHE_PATH)
  ? (JSON.parse(readFileSync(CACHE_PATH, "utf8")) as Record<string, string>)
  : {};
let cacheKotor = false;

const fetchAsli = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = String(input);
  const body = typeof init?.body === "string" ? init.body : "";
  if (url.includes("/embeddings") && body) {
    if (cacheEmbed[body]) {
      return new Response(cacheEmbed[body], { status: 200, headers: { "content-type": "application/json" } });
    }
    const resp = await fetchAsli(input, init);
    const teks = await resp.clone().text();
    if (resp.ok) {
      cacheEmbed[body] = teks;
      cacheKotor = true;
    }
    return resp;
  }
  return fetchAsli(input, init);
}) as typeof fetch;

function simpanCache() {
  if (cacheKotor) writeFileSync(CACHE_PATH, JSON.stringify(cacheEmbed));
}

// Diimpor SETELAH fetch dibungkus agar panggilan embedding memakai cache.
const { search } = await import("../src/services/rag");

interface Kasus {
  id: number;
  pertanyaan: string;
  dokumen_id: number;
}

interface Hasil {
  jumlah: number;
  hit1: number;
  hit8: number;
  mrr: number;
}

const KONFIGURASI: Array<{ nama: string; env: Record<string, string> }> = [
  { nama: "bawaan (0.42/0.26/0.20/0.12, λ0.30)", env: {} },
  { nama: "vektor dominan (0.60/0.20/0.12/0.08)", env: { RERANK_W_SIM: "0.6", RERANK_W_LEKSIKAL: "0.2", RERANK_W_ENTITAS: "0.12", RERANK_W_JUDUL: "0.08" } },
  { nama: "leksikal dominan (0.25/0.45/0.20/0.10)", env: { RERANK_W_SIM: "0.25", RERANK_W_LEKSIKAL: "0.45", RERANK_W_ENTITAS: "0.2", RERANK_W_JUDUL: "0.1" } },
  { nama: "entitas kuat (0.30/0.20/0.40/0.10)", env: { RERANK_W_SIM: "0.3", RERANK_W_LEKSIKAL: "0.2", RERANK_W_ENTITAS: "0.4", RERANK_W_JUDUL: "0.1" } },
  { nama: "judul kuat (0.28/0.20/0.17/0.35)", env: { RERANK_W_SIM: "0.28", RERANK_W_LEKSIKAL: "0.2", RERANK_W_ENTITAS: "0.17", RERANK_W_JUDUL: "0.35" } },
  { nama: "lambda rendah (diversitas 0.1)", env: { RERANK_W_LAMBDA: "0.1" } },
  { nama: "lambda sedang (diversitas 0.5)", env: { RERANK_W_LAMBDA: "0.5" } },
  { nama: "tanpa MMR (λ0)", env: { RERANK_W_LAMBDA: "0" } },
];

function bersihkanEnv() {
  for (const k of ["RERANK_W_SIM", "RERANK_W_LEKSIKAL", "RERANK_W_ENTITAS", "RERANK_W_JUDUL", "RERANK_W_LAMBDA", "RERANK_PER_DOKUMEN"]) {
    delete process.env[k];
  }
}

async function ukur(kasus: Kasus[]): Promise<Hasil> {
  let hit1 = 0;
  let hit8 = 0;
  let jumlahRr = 0;

  for (const k of kasus) {
    const hasil = await search(k.pertanyaan);
    const posisi = hasil.labeled.findIndex((r) => Number(r.document_id) === Number(k.dokumen_id));
    if (posisi === 0) hit1++;
    if (posisi >= 0 && posisi < 8) hit8++;
    if (posisi >= 0) jumlahRr += 1 / (posisi + 1);
  }
  const jumlah = kasus.length || 1;
  return { jumlah: kasus.length, hit1, hit8, mrr: jumlahRr / jumlah };
}

async function main() {
  const pakaiGrid = process.argv.includes("--grid");
  const batasIdx = process.argv.indexOf("--batas");
  const batas = batasIdx >= 0 ? Number(process.argv[batasIdx + 1]) : 0;
  const dokIdx = process.argv.indexOf("--dokumen");
  const dokIds = dokIdx >= 0
    ? String(process.argv[dokIdx + 1] ?? "").split(",").map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n > 0)
    : [];

  const { rows } = await pool.query<Kasus>(
    `SELECT id, pertanyaan, dokumen_id FROM retrieval_cases
      WHERE aktif ${dokIds.length ? "AND dokumen_id = ANY($1::bigint[])" : ""}
      ORDER BY id ${batas > 0 ? "LIMIT " + batas : ""}`,
    dokIds.length ? [dokIds] : [],
  );
  if (rows.length === 0) {
    console.error("[bench] belum ada kasus — jalankan generate-eval-set.ts dulu");
    process.exit(1);
  }
  console.log(`[bench] ${rows.length} kasus\n`);

  if (!pakaiGrid) {
    const h = await ukur(rows);
    console.log(
      `hit@1 ${((h.hit1 / h.jumlah) * 100).toFixed(1)}% | hit@8 ${((h.hit8 / h.jumlah) * 100).toFixed(1)}% | MRR ${h.mrr.toFixed(3)}`,
    );
  } else {
    const hasil: Array<{ nama: string; h: Hasil }> = [];
    for (const cfg of KONFIGURASI) {
      bersihkanEnv();
      Object.assign(process.env, cfg.env);
      const h = await ukur(rows);
      hasil.push({ nama: cfg.nama, h });
      console.log(
        `${cfg.nama.padEnd(42)} hit@1 ${((h.hit1 / h.jumlah) * 100).toFixed(1)}% | hit@8 ${((h.hit8 / h.jumlah) * 100).toFixed(1)}% | MRR ${h.mrr.toFixed(3)}`,
      );
    }
    bersihkanEnv();
    const terbaik = [...hasil].sort((a, b) => b.h.hit8 - a.h.hit8 || b.h.mrr - a.h.mrr)[0];
    console.log(`\n[bench] terbaik: ${terbaik.nama}`);
    console.log(
      `[bench] hit@8 ${((terbaik.h.hit8 / terbaik.h.jumlah) * 100).toFixed(1)}% | MRR ${terbaik.h.mrr.toFixed(3)}`,
    );
  }

  simpanCache();
  await pool.end();
}

if (import.meta.main) {
  main().catch(async (e) => {
    console.error(e);
    await pool.end().catch(() => {});
    process.exit(1);
  });
}
