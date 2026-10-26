/**
 * query-filters.ts — pembantu penyusun klausa WHERE untuk endpoint list.
 *
 * Pola `conditions.push(\`kolom = $${paramIdx++}\`); params.push(nilai)` sebelumnya
 * disalin di service analisis/artikel/crawler. Di sini hanya bentuk yang identik
 * yang dibagi; pemanggil tetap memegang array & indeksnya.
 */

/** Tambah `kolom = $n` bila nilai tidak kosong. Mengembalikan indeks param berikutnya. */
export function pushEq(
  conditions: string[],
  params: unknown[],
  paramIdx: number,
  column: string,
  value: string,
): number {
  if (value) {
    conditions.push(`${column} = $${paramIdx++}`);
    params.push(value);
  }
  return paramIdx;
}

/** Tambah `kolom ILIKE $n` (pola %nilai%) bila nilai tidak kosong. */
export function pushIlike(
  conditions: string[],
  params: unknown[],
  paramIdx: number,
  column: string,
  value: string,
): number {
  if (value) {
    conditions.push(`${column} ILIKE $${paramIdx++}`);
    params.push(`%${value}%`);
  }
  return paramIdx;
}

/** Susun klausa WHERE dari daftar kondisi (kosong bila tidak ada kondisi). */
export function whereClause(conditions: string[]): string {
  return conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
}
