from pathlib import Path

from .base import Segment
from .headings import split_page_sections


def parse_pdf(path: Path, ocr: bool = False) -> list[Segment]:
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    segments: list[Segment] = []
    judul_terakhir: str | None = None
    for i, page in enumerate(reader.pages, start=1):
        text = (page.extract_text() or "").strip()
        if not text and ocr:
            text = _ocr_page(str(path), i)
        if not text:
            segments.append(Segment(text="", page_or_slide=i, needs_ocr=True))
            continue
        # PDF tidak menyimpan struktur; judul dideteksi dari pola baris.
        # Halaman lanjutan mewarisi judul terakhir agar chunk tetap berkonteks.
        for judul, isi in split_page_sections(text):
            if judul is None:
                judul = judul_terakhir
            else:
                judul_terakhir = judul
            segments.append(Segment(text=isi, page_or_slide=i, section_title=judul))
    return segments


def _ocr_page(pdf_path: str, page_no: int) -> str:
    """OCR satu halaman PDF scan via pdftoppm (render) + pytesseract."""
    import subprocess
    import tempfile
    from pathlib import Path

    import pytesseract

    with tempfile.TemporaryDirectory() as td:
        prefix = Path(td) / "page"
        # pdftoppm lebih robust terhadap kompresi gambar yang PyMuPDF tak dukung
        # ("Unsupported image object"). -f/-l sama = render satu halaman saja.
        subprocess.run(
            ["pdftoppm", "-f", str(page_no), "-l", str(page_no), "-r", "300", "-png", pdf_path, str(prefix)],
            check=True, capture_output=True,
        )
        pngs = sorted(Path(td).glob("page-*.png"))
        if not pngs:
            return ""
        # ind+eng: dokumen utama berbahasa Indonesia; eng sebagai pelengkap istilah.
        return pytesseract.image_to_string(str(pngs[0]), lang="ind+eng").strip()
