"""Deteksi judul bagian pada teks hasil ekstraksi PDF.

PDF hanya memberi teks polos tanpa struktur. Dokumen resmi Bappenas punya pola
judul yang cukup konsisten, sehingga bisa dikenali dengan aturan:

  1. "BAB II", "BAGIAN KEDUA", "LAMPIRAN 3"
  2. Penomoran bertingkat: "2.3.6 Ketahanan Pangan"
  3. Baris pendek HURUF BESAR (bukan kalimat, tanpa titik akhir)

Fungsi ini murni (tanpa I/O) supaya bisa dites.
"""
import re

_POLA_JUDUL = [
    re.compile(r"^(BAB|BAGIAN|LAMPIRAN|BUKU|SUB\s?BAB)\s+([IVXLC]+|\d+)\b", re.IGNORECASE),
    re.compile(r"^\d+(\.\d+){0,3}\.?\s+[A-Z][^.]{2,90}$"),
]
_AKHIR_KALIMAT = re.compile(r"[.!?:;,]\s*$")
_BARIS_TABEL = re.compile(r"\d[\d.,]{2,}.*\d[\d.,]{2,}.*\d[\d.,]{2,}")


def _kandidat_judul(baris: str) -> bool:
    t = baris.strip()
    if not (3 <= len(t) <= 90):
        return False
    if _AKHIR_KALIMAT.search(t):
        return False
    if _BARIS_TABEL.search(t):
        return False
    if any(p.match(t) for p in _POLA_JUDUL):
        return True

    # HURUF BESAR: minimal 2 kata, mayoritas huruf kapital, tanpa angka mencolok.
    huruf = [c for c in t if c.isalpha()]
    if len(huruf) >= 6 and sum(1 for c in huruf if c.isupper()) / len(huruf) >= 0.9:
        return len(t.split()) >= 2
    return False


def split_page_sections(text: str) -> list[tuple[str | None, str]]:
    """Pecah teks satu halaman menjadi [(judul, isi), ...].

    Bila tidak ada judul terdeteksi, hasilnya satu bagian dengan judul None —
    perilaku lama tetap terjaga.
    """
    baris = text.splitlines()
    bagian: list[tuple[str | None, list[str]]] = []
    judul_kini: str | None = None
    isi: list[str] = []

    for b in baris:
        if _kandidat_judul(b):
            if isi and any(x.strip() for x in isi):
                bagian.append((judul_kini, isi))
                judul_kini = b.strip()
            elif judul_kini:
                # Judul berlanjut (mis. "BAB II" lalu baris "KERANGKA EKONOMI
                # MAKRO"): gabungkan agar konteksnya utuh.
                gabung = f"{judul_kini} {b.strip()}"
                judul_kini = gabung if len(gabung) <= 90 else b.strip()
            else:
                judul_kini = b.strip()
            isi = []
        else:
            isi.append(b)

    if isi and any(x.strip() for x in isi):
        bagian.append((judul_kini, isi))

    hasil: list[tuple[str | None, str]] = []
    for judul, kumpulan in bagian:
        teks = "\n".join(kumpulan).strip()
        if teks:
            hasil.append((judul, teks))
    return hasil or [(None, text.strip())]
