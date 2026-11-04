import re
from dataclasses import dataclass

import tiktoken

from parsers import Segment

_ENC = tiktoken.get_encoding("cl100k_base")
_SENT_SPLIT = re.compile(r"(?<=[.!?。！？])\s+|(?<=\n)\s*")


@dataclass
class Chunk:
    text: str
    page_or_slide: int | None
    section_title: str | None
    chunk_index: int


def token_count(text: str) -> int:
    try:
        return len(_ENC.encode(text))
    except Exception:
        # fallback deterministik tanpa jaringan
        return max(1, len(text) // 4)


def token_tail(text: str, ratio: float = 0.15) -> str:
    toks = _ENC.encode(text)
    n = max(1, int(len(toks) * ratio))
    return _ENC.decode(toks[-n:])


def split_sentences(text: str) -> list[str]:
    parts = [p.strip() for p in _SENT_SPLIT.split(text) if p.strip()]
    return parts or ([text] if text.strip() else [])


def _join(prefix: str, *parts: str) -> str:
    """Gabung potongan teks dengan spasi tunggal, buang spasi tepi."""
    return " ".join(p for p in (prefix, *parts) if p).strip()


def _satuan(segments: list[Segment]) -> list[tuple[str, int | None, str | None]]:
    """Kalimat + metadata asalnya (halaman & judul) dari seluruh segmen."""
    hasil: list[tuple[str, int | None, str | None]] = []
    for seg in segments:
        teks = seg.text.replace("\x00", "") if "\x00" in seg.text else seg.text
        for kalimat in split_sentences(teks):
            hasil.append((kalimat, seg.page_or_slide, seg.section_title))
    return hasil


def chunk_segments(segments: list[Segment], *, min_tokens: int = 300,
                   max_tokens: int = 800, overlap_ratio: float = 0.15,
                   lintas_halaman: bool = True) -> list[Chunk]:
    """Pecah dokumen menjadi chunk.

    `lintas_halaman=True` (bawaan) menyambung kalimat antar-halaman: buffer tidak
    di-flush di akhir tiap halaman, sehingga kalimat yang terpotong oleh batas
    halaman tidak lagi menjadi dua chunk terpisah. Metadata (halaman & judul)
    diambil dari kalimat pertama di dalam chunk.

    `lintas_halaman=False` mempertahankan perilaku lama (flush per segmen) —
    disediakan untuk pembanding A/B.
    """
    if not lintas_halaman:
        return _chunk_per_segmen(segments, max_tokens=max_tokens, overlap_ratio=overlap_ratio)

    chunks: list[Chunk] = []
    buf: list[str] = []
    page: int | None = None
    section: str | None = None
    tail = ""
    idx = 0

    def flush() -> None:
        nonlocal buf, tail, idx
        if not buf:
            return
        teks = _join(tail, " ".join(buf))
        chunks.append(Chunk(text=teks, page_or_slide=page, section_title=section, chunk_index=idx))
        idx += 1
        tail = token_tail(teks, overlap_ratio)
        buf = []

    for kalimat, hal, judul in _satuan(segments):
        if not buf:
            page, section = hal, judul
        kandidat = _join(tail, " ".join(buf), kalimat)
        if token_count(kandidat) <= max_tokens:
            buf.append(kalimat)
            continue

        flush()
        if not buf:
            page, section = hal, judul
        # Setelah flush, `tail` berisi ekor chunk sebelumnya sebagai overlap.
        if token_count(_join(tail, kalimat)) <= max_tokens:
            buf = [kalimat]
        elif token_count(kalimat) <= max_tokens:
            # tail + kalimat melewati batas keras, tapi kalimatnya sendiri muat.
            tail = ""
            buf = [kalimat]
        else:
            # Kalimat tunggal melebihi batas keras → simpan apa adanya (fallback).
            tail = ""
            chunks.append(Chunk(text=kalimat, page_or_slide=hal, section_title=judul, chunk_index=idx))
            idx += 1

    flush()
    return chunks


def _chunk_per_segmen(segments: list[Segment], *, max_tokens: int,
                      overlap_ratio: float) -> list[Chunk]:
    """Perilaku lama: buffer di-flush di akhir setiap segmen (pembanding A/B)."""
    chunks: list[Chunk] = []
    idx = 0
    for seg in segments:
        if "\x00" in seg.text:
            seg.text = seg.text.replace("\x00", "")
        for text in _segment_chunk_texts(seg, max_tokens=max_tokens, overlap_ratio=overlap_ratio):
            chunks.append(Chunk(text=text, page_or_slide=seg.page_or_slide,
                                section_title=seg.section_title, chunk_index=idx))
            idx += 1
    return chunks


def _segment_chunk_texts(seg: Segment, *, max_tokens: int, overlap_ratio: float) -> list[str]:
    """Pecah satu segmen menjadi daftar teks chunk (batas keras `max_tokens`)."""
    texts: list[str] = []
    tail = ""
    buffer = ""
    for sent in split_sentences(seg.text):
        candidate = _join(tail, buffer, sent) if buffer else _join(tail, sent)
        if token_count(candidate) <= max_tokens:
            buffer = candidate
            continue
        if buffer:
            texts.append(buffer)
            tail = token_tail(buffer, overlap_ratio)
            buffer = ""
        cand2 = _join(tail, sent)
        if token_count(cand2) <= max_tokens:
            buffer = cand2
            tail = ""
        elif token_count(sent) <= max_tokens:
            buffer = sent
            tail = ""
        else:
            texts.append(sent)
            tail = ""
    if buffer:
        texts.append(buffer)
    return texts
