/**
 * Hitung biaya LLM dari jumlah token dan harga per 1 juta token.
 * Murni (tanpa DB) supaya mudah dites dan dipakai ulang agregator.
 *
 * Aturan: kalau harga salah satu sisi tidak diketahui → hasil NULL.
 * Jangan pernah mengembalikan 0 untuk model tanpa harga (0 = "gratis", itu bohong).
 */
export interface HargaModel {
  usd_in_per_1m: number | null;
  usd_out_per_1m: number | null;
}

export function hitungBiaya(
  harga: HargaModel | null | undefined,
  tokenIn: number | null | undefined,
  tokenOut: number | null | undefined,
): number | null {
  if (!harga) return null;
  const tin = tokenIn ?? 0;
  const tout = tokenOut ?? 0;
  if (tin <= 0 && tout <= 0) return null;

  const sisiIn = tin > 0 ? harga.usd_in_per_1m : 0;
  const sisiOut = tout > 0 ? harga.usd_out_per_1m : 0;
  if (sisiIn === null || sisiOut === null) return null;

  const biaya = (tin / 1_000_000) * sisiIn + (tout / 1_000_000) * sisiOut;
  return Math.round(biaya * 1_000_000) / 1_000_000;
}
