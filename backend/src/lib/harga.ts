import { pool } from "../db";
import { hitungBiaya, type HargaModel } from "./prices";

/** Ambil harga model dari tabel model_prices (numeric pg = string → parse). */
export async function ambilHarga(model: string | null | undefined): Promise<HargaModel | null> {
  if (!model) return null;
  const r = await pool.query(
    "SELECT usd_in_per_1m, usd_out_per_1m FROM model_prices WHERE model = $1",
    [model]
  );
  const row = r.rows[0];
  if (!row) return null;
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return { usd_in_per_1m: num(row.usd_in_per_1m), usd_out_per_1m: num(row.usd_out_per_1m) };
}

/** Biaya satu panggilan LLM; null bila harga model belum diketahui. */
export async function biayaUntuk(
  model: string | null | undefined,
  tokenIn: number | null | undefined,
  tokenOut: number | null | undefined
): Promise<number | null> {
  const harga = await ambilHarga(model);
  return hitungBiaya(harga, tokenIn, tokenOut);
}
