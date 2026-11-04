/**
 * Agregator Log Harian MIH.
 *
 * Menghitung metrik harian dari sumber nyata:
 *  - usage_logs / messages / conversations  → pertanyaan, user, latency, sitasi, biaya
 *  - documents / chunks / articles          → korpus & ingest
 *  - /var/log/nginx/access.log (JSON)       → trafik, dipisah bot vs manusia
 *  - eval_runs terakhir                     → kualitas RAG
 *
 * Idempoten: aman dijalankan berulang (ON CONFLICT DO UPDATE).
 *
 * Pakai:
 *   bun scripts/aggregate-daily.ts            # hari kemarin + hari ini
 *   bun scripts/aggregate-daily.ts --backfill 30
 */
import { readFile } from "node:fs/promises";
import { pool } from "../src/db";
import { isBot, kelompokJalur, kelasStatus } from "../src/lib/trafik";

const ACCESS_LOG = process.env.ACCESS_LOG_PATH ?? "/var/log/nginx/access.log";

interface BarisLog {
  ts?: string;
  ip?: string;
  path?: string;
  method?: string;
  status?: number;
  ua?: string;
}

function argAngka(nama: string, bawaan: number): number {
  const i = process.argv.indexOf(nama);
  if (i === -1) return bawaan;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) && v > 0 ? v : bawaan;
}

function tanggalISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function rentangHari(mundur: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i <= mundur; i++) {
    const d = new Date(now.getTime() - i * 86_400_000);
    out.push(tanggalISO(d));
  }
  return out; // terbaru → terlama
}

async function simpan(
  tanggal: string,
  kategori: string,
  metrik: string,
  nilai: number,
  dimensi = "",
): Promise<void> {
  await pool.query(
    `INSERT INTO daily_metrics (tanggal, kategori, metrik, dimensi, nilai, updated_at)
     VALUES ($1,$2,$3,$4,$5,now())
     ON CONFLICT (tanggal, kategori, metrik, dimensi)
     DO UPDATE SET nilai = EXCLUDED.nilai, updated_at = now()`,
    [tanggal, kategori, metrik, dimensi, nilai],
  );
}

/** ---- 1. Trafik dari log nginx ---- */
async function agregasiTrafik(hari: string[]): Promise<number> {
  let isi: string;
  try {
    isi = await readFile(ACCESS_LOG, "utf8");
  } catch {
    console.warn(`[trafik] log tidak terbaca: ${ACCESS_LOG} — dilewati`);
    return 0;
  }

  const set = new Set(hari);
  const agg = new Map<string, { hits: number; ips: Set<string> }>();

  for (const baris of isi.split("\n")) {
    const t = baris.trim();
    if (!t.startsWith("{")) continue;
    let b: BarisLog;
    try {
      b = JSON.parse(t) as BarisLog;
    } catch {
      continue;
    }
    const tgl = (b.ts ?? "").slice(0, 10);
    if (!set.has(tgl)) continue;

    const jalur = kelompokJalur(b.path ?? "/");
    const bot = isBot(b.ua, b.path ?? "/");
    const kunci = `${tgl}|${jalur}|${kelasStatus(b.status ?? 0)}|${bot}`;
    const cur = agg.get(kunci) ?? { hits: 0, ips: new Set<string>() };
    cur.hits += 1;
    if (b.ip) cur.ips.add(b.ip);
    agg.set(kunci, cur);
  }

  for (const [kunci, v] of agg) {
    const [tgl, jalur, kelas, bot] = kunci.split("|");
    await pool.query(
      `INSERT INTO access_daily (tanggal, jalur, kelas_status, is_bot, hits, ip_unik)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (tanggal, jalur, kelas_status, is_bot)
       DO UPDATE SET hits = EXCLUDED.hits, ip_unik = EXCLUDED.ip_unik`,
      [tgl, jalur, kelas, bot === "true", v.hits, v.ips.size],
    );
  }
  return agg.size;
}

/** ---- 2. Pertanyaan & biaya ---- */
async function agregasiPertanyaan(tanggal: string): Promise<void> {
  const r = await pool.query(
    `SELECT
       count(*)::int AS jumlah,
       count(DISTINCT user_id)::int AS user_unik,
       coalesce(avg(latency_ms),0)::numeric AS lat_avg,
       coalesce(percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms),0)::numeric AS lat_p50,
       coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms),0)::numeric AS lat_p95,
       count(*) FILTER (WHERE answer LIKE 'Saya tidak menemukan%')::int AS menolak,
       coalesce(sum(jsonb_array_length(cited_chunks)),0)::int AS sitasi_total,
       count(*) FILTER (WHERE jsonb_array_length(cited_chunks) = 0)::int AS tanpa_sitasi,
       coalesce(sum(biaya_usd),0)::numeric AS biaya_total,
       count(*) FILTER (WHERE biaya_usd IS NOT NULL)::int AS punya_biaya
     FROM usage_logs
     WHERE created_at::date = $1`,
    [tanggal],
  );
  const q = r.rows[0];

  const jumlah = Number(q.jumlah);
  if (jumlah === 0) {
    await simpan(tanggal, "pertanyaan", "jumlah", 0);
    return;
  }

  await simpan(tanggal, "pertanyaan", "jumlah", jumlah);
  await simpan(tanggal, "pertanyaan", "user_unik", Number(q.user_unik));
  await simpan(tanggal, "pertanyaan", "latency_avg_ms", Math.round(Number(q.lat_avg)));
  await simpan(tanggal, "pertanyaan", "latency_p50_ms", Math.round(Number(q.lat_p50)));
  await simpan(tanggal, "pertanyaan", "latency_p95_ms", Math.round(Number(q.lat_p95)));
  await simpan(tanggal, "pertanyaan", "menolak", Number(q.menolak));
  await simpan(tanggal, "pertanyaan", "menolak_persen", Math.round((Number(q.menolak) / jumlah) * 1000) / 10);
  await simpan(tanggal, "pertanyaan", "sitasi_total", Number(q.sitasi_total));
  await simpan(tanggal, "pertanyaan", "sitasi_rata", Math.round((Number(q.sitasi_total) / jumlah) * 100) / 100);
  await simpan(tanggal, "pertanyaan", "tanpa_sitasi", Number(q.tanpa_sitasi));
  await simpan(tanggal, "pertanyaan", "biaya_total_usd", Number(q.biaya_total));
  await simpan(tanggal, "pertanyaan", "biaya_rata_usd", Math.round((Number(q.biaya_total) / jumlah) * 1e6) / 1e6);

  // sesi chat baru
  const s = await pool.query(
    `SELECT count(*)::int AS n FROM conversations WHERE created_at::date = $1`,
    [tanggal],
  );
  await simpan(tanggal, "pertanyaan", "sesi_baru", Number(s.rows[0].n));

  // per model
  const m = await pool.query(
    `SELECT model, count(*)::int AS n, coalesce(sum(biaya_usd),0)::numeric AS biaya
     FROM usage_logs WHERE created_at::date = $1 AND model IS NOT NULL
     GROUP BY model`,
    [tanggal],
  );
  for (const row of m.rows) {
    await simpan(tanggal, "pertanyaan", "jumlah_model", Number(row.n), `model:${row.model}`);
    await simpan(tanggal, "pertanyaan", "biaya_model_usd", Number(row.biaya), `model:${row.model}`);
  }
}

/** ---- 3. Korpus & ingest ---- */
async function agregasiKorpus(tanggal: string): Promise<void> {
  const d = await pool.query(
    `SELECT count(*)::int AS n FROM documents WHERE created_at::date = $1`,
    [tanggal],
  );
  await simpan(tanggal, "korpus", "dokumen_baru", Number(d.rows[0].n));

  const c = await pool.query(
    `SELECT count(*)::int AS n FROM chunks WHERE created_at::date = $1`,
    [tanggal],
  ).catch(() => ({ rows: [{ n: 0 }] }));
  await simpan(tanggal, "korpus", "chunk_baru", Number(c.rows[0].n));

  const a = await pool.query(
    `SELECT count(*)::int AS n FROM articles WHERE created_at::date = $1`,
    [tanggal],
  ).catch(() => ({ rows: [{ n: 0 }] }));
  await simpan(tanggal, "korpus", "artikel_baru", Number(a.rows[0].n));
}

/** ---- 4. Kualitas RAG (dari evaluasi terakhir) ---- */
async function agregasiKualitas(tanggal: string): Promise<void> {
  const r = await pool.query(
    `SELECT agregat, kapan FROM eval_runs ORDER BY kapan DESC LIMIT 1`,
  ).catch(() => ({ rows: [] as Array<{ agregat: unknown; kapan: Date }> }));
  const row = r.rows[0];
  if (!row) return;
  const ag = (row.agregat ?? {}) as Record<string, unknown>;
  const inti = (ag["metrik_inti_tanpa_kasus_ambigu"] ?? {}) as Record<string, number>;
  if (typeof inti["retrieval_gagal_persen"] === "number") {
    await simpan(tanggal, "kualitas", "retrieval_gagal_persen", inti["retrieval_gagal_persen"]);
  }
  if (typeof inti["jawaban_benar_dan_sitasi_benar_persen"] === "number") {
    await simpan(tanggal, "kualitas", "jawaban_benar_sitasi_benar_persen", inti["jawaban_benar_dan_sitasi_benar_persen"]);
  }
}

async function main(): Promise<void> {
  const mundur = argAngka("--backfill", 1);
  const hari = rentangHari(mundur);
  console.log(`[aggregate] hari: ${hari.join(", ")}`);

  const n = await agregasiTrafik(hari);
  console.log(`[aggregate] access_daily: ${n} baris`);

  for (const tgl of hari) {
    await agregasiPertanyaan(tgl);
    await agregasiKorpus(tgl);
    await agregasiKualitas(tgl);
  }
  console.log("[aggregate] selesai");
  await pool.end();
}

if (import.meta.main) {
  main().catch(async (e) => {
    console.error("[aggregate] gagal:", e);
    await pool.end().catch(() => {});
    process.exit(1);
  });
}
