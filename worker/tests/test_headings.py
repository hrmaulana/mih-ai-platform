from parsers.headings import split_page_sections


def test_deteksi_bab():
    teks = "BAB II\nKERANGKA EKONOMI MAKRO\n\nPertumbuhan ekonomi 2026 ditargetkan 5,35 persen."
    bagian = split_page_sections(teks)
    # "BAB II" + baris judul berikutnya digabung agar konteks subbab utuh.
    assert bagian[0][0].startswith("BAB II")
    assert "KERANGKA EKONOMI MAKRO" in bagian[0][0]
    assert "5,35" in bagian[0][1]


def test_deteksi_penomoran_bertingkat():
    teks = "2.3.6 Ketahanan Pangan\n\nProduksi padi meningkat 4,2 persen pada 2026."
    bagian = split_page_sections(teks)
    assert bagian[0][0] == "2.3.6 Ketahanan Pangan"


def test_deteksi_huruf_besar():
    teks = "TARGET PEMBANGUNAN NASIONAL\n\nTarget kemiskinan 6,5 sampai 7,5 persen."
    bagian = split_page_sections(teks)
    assert bagian[0][0] == "TARGET PEMBANGUNAN NASIONAL"


def test_kalimat_biasa_bukan_judul():
    teks = "Pertumbuhan ekonomi diperkirakan mencapai 5,35 persen pada tahun 2026."
    bagian = split_page_sections(teks)
    assert bagian[0][0] is None


def test_baris_tabel_bukan_judul():
    teks = "1.234.567   2.345.678   3.456.789\nAngka tersebut adalah realisasi anggaran."
    bagian = split_page_sections(teks)
    assert bagian[0][0] is None


def test_halaman_tanpa_judul_tetap_satu_bagian():
    teks = "Isi halaman tanpa judul apa pun di dalamnya."
    bagian = split_page_sections(teks)
    assert len(bagian) == 1
    assert bagian[0][0] is None
    assert "tanpa judul" in bagian[0][1]


def test_beberapa_bagian_dalam_satu_halaman():
    teks = (
        "1.1 Latar Belakang\n\nUraian latar belakang.\n\n"
        "1.2 Tujuan\n\nUraian tujuan penulisan."
    )
    bagian = split_page_sections(teks)
    judul = [b[0] for b in bagian]
    assert "1.1 Latar Belakang" in judul
    assert "1.2 Tujuan" in judul
