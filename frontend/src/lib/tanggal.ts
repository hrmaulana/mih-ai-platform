/**
 * Format tanggal terbit berita/publikasi.
 *
 * Sumber utama: `published_date` (DATE, ISO "2026-08-08") → ditampilkan
 * sebagai "8 Agustus 2026". Bila kosong, jatuh ke kolom `date` lama (teks
 * bebas) agar konten lama tetap tampil.
 */
const BULAN_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export function tanggalTerbit(item: {
  published_date?: string | null;
  date?: string | null;
}): string {
  const iso = item.published_date;
  if (iso) {
    const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
    if (!Number.isNaN(d.getTime())) {
      return `${d.getDate()} ${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;
    }
  }
  return item.date ?? "";
}
