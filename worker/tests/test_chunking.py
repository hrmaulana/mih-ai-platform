from chunking import chunk_segments, token_count, split_sentences, token_tail
from parsers import Segment


def test_split_sentences_basic():
    text = "Kalimat pertama. Kalimat kedua! Kalimat ketiga?"
    assert split_sentences(text) == ["Kalimat pertama.", "Kalimat kedua!", "Kalimat ketiga?"]


def test_nul_bytes_dibuang_dari_chunk():
    # PostgreSQL menolak NUL byte; beberapa PDF kotor menyisipkannya.
    seg = Segment(text="Teks normal.\x00 Teks dengan NUL tersembunyi\x00.",
                  page_or_slide=1, section_title="x")
    chunks = chunk_segments([seg])
    assert chunks
    assert "\x00" not in "".join(c.text for c in chunks)


def test_chunk_size_within_max():
    seg = Segment(text=" ".join(["Ini adalah kalimat pengisi untuk menguji chunking dokumen kedeputian."] * 200),
                  page_or_slide=1, section_title="Bab 1")
    chunks = chunk_segments([seg])
    assert chunks, "harus menghasilkan minimal satu chunk"
    for c in chunks:
        assert token_count(c.text) <= 800, f"chunk {c.chunk_index} melebihi 800 token"


def test_chunk_metadata_present():
    seg = Segment(text=" ".join(["Kata kata pengisi untuk menguji metadata chunk."] * 80),
                  page_or_slide=3, section_title="Sub-bab A")
    chunks = chunk_segments([seg])
    assert len(chunks) >= 1
    for c in chunks:
        assert c.page_or_slide == 3
        assert c.section_title == "Sub-bab A"


def test_overlap_between_consecutive_chunks():
    seg = Segment(text=" ".join(["Kata kata pengisi yang cukup panjang agar terpecah menjadi beberapa chunk."] * 150),
                  page_or_slide=1, section_title="x")
    chunks = chunk_segments([seg])
    assert len(chunks) >= 2
    for a, b in zip(chunks, chunks[1:]):
        tail = token_tail(a.text, 0.15)
        assert tail in b.text, "overlap antar chunk tidak ditemukan"


def test_chunk_indices_sequential():
    seg = Segment(text=" ".join(["Kata kata pengisi untuk urutan chunk."] * 120),
                  page_or_slide=2, section_title="y")
    chunks = chunk_segments([seg])
    assert [c.chunk_index for c in chunks] == list(range(len(chunks)))


def test_hard_cap_not_exceeded_by_tail_plus_sentence():
    # Filler pendek membangun buffer besar; tail overlap yang dibawa + satu
    # kalimat panjang harus tetap di bawah batas keras 800 token.
    filler = "Ini adalah kalimat pengisi pendek."
    long_sent = " ".join(["kata"] * 760)  # tanpa tanda baca akhir → satu kalimat
    assert token_count(long_sent) <= 800  # long sentence alone muat
    text = " ".join([filler] * 85) + " " + long_sent
    seg = Segment(text=text, page_or_slide=1, section_title="x")
    chunks = chunk_segments([seg])
    assert chunks
    for c in chunks:
        assert token_count(c.text) <= 800, \
            f"chunk {c.chunk_index} melebihi 800 token: {token_count(c.text)}"


def test_kalimat_terpotong_batas_halaman_disambung():
    """Kalimat yang terbelah dua halaman harus utuh dalam satu chunk."""
    seg1 = Segment(text="Pendahuluan halaman satu. Kalimat ini berlanjut",
                   page_or_slide=1, section_title=None)
    seg2 = Segment(text="ke halaman dua tanpa terputus. Kalimat penutup.",
                   page_or_slide=2, section_title=None)

    sambung = chunk_segments([seg1, seg2])
    gabungan = " ".join(c.text for c in sambung)
    assert "berlanjut ke halaman dua" in gabungan

    # Perilaku lama: tidak ada SATU chunk pun yang memuat frasa lintas halaman.
    per_halaman = chunk_segments([seg1, seg2], lintas_halaman=False)
    assert not any("berlanjut ke halaman dua" in c.text for c in per_halaman)


def test_metadata_diambil_dari_kalimat_pertama():
    # Harus melewati batas keras 800 token agar halaman 2 benar-benar jadi chunk baru.
    seg1 = Segment(text="Isi halaman satu yang cukup panjang untuk mengisi chunk pertama dokumen ini. " * 90,
                   page_or_slide=1, section_title="Bab 1")
    seg2 = Segment(text="Isi halaman dua yang juga panjang agar memaksa chunk baru. " * 120, page_or_slide=2, section_title="Bab 2")
    chunks = chunk_segments([seg1, seg2])
    assert chunks[0].page_or_slide == 1
    assert chunks[0].section_title == "Bab 1"
    assert any(c.page_or_slide == 2 for c in chunks)
