/**
 * Buat slug dari judul.
 *
 * Contoh:
 *   "Pelayanan Pendampingan Pengalokasian Anggaran bagi Kementerian/Lembaga"
 *   -> "pelayanan-pendampingan-pengalokasian-anggaran-bagi-kementerian-lembaga"
 *
 * Aturan: huruf kecil, tanda baca/simbol -> "-", "-" ganda & di ujung dipangkas.
 */
export function slugify(teks: string): string {
  return teks
    .normalize("NFD")                      // pisahkan diakritik
    .replace(/[\u0300-\u036f]/g, "")      // buang diakritik (é -> e)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")           // apa pun selain huruf/angka -> "-"
    .replace(/-{2,}/g, "-")                // "-" ganda jadi satu
    .replace(/^-+|-+$/g, "");              // pangkas "-" di awal/akhir
}
