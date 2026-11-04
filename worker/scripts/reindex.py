"""Reindex dokumen yang sudah ada memakai chunker terbaru.

Memakai ulang `ingest.process_document`: parse ulang berkas asli dari volume,
embed ulang, lalu ganti chunk lama (DELETE + INSERT dalam satu transaksi).

Contoh:
  python scripts/reindex.py --dry-run --limit 20     # ukur dampak, tanpa menulis
  python scripts/reindex.py --limit 20               # proses 20 dokumen sampel
  python scripts/reindex.py --dokumen 12,34,56       # dokumen tertentu
"""
import argparse
import re
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from chunking import chunk_segments, token_count  # noqa: E402
from db import connect  # noqa: E402
from parsers import parse_document  # noqa: E402

AKHIR_KALIMAT = re.compile(r"[.!?:;]\s*$")


def _ringkas(chunks) -> dict:
    tokens = [token_count(c.text) for c in chunks]
    return {
        "jumlah": len(chunks),
        "median_token": int(statistics.median(tokens)) if tokens else 0,
        "akhir_tanda_pct": round(100 * sum(1 for c in chunks if AKHIR_KALIMAT.search(c.text)) / max(1, len(chunks)), 1),
        "ada_judul_pct": round(100 * sum(1 for c in chunks if c.section_title) / max(1, len(chunks)), 1),
    }


def _ambil_dokumen(conn, limit: int, ids: list[int] | None):
    if ids:
        return conn.execute(
            """SELECT id, filename, file_path, file_extension FROM documents
                WHERE id = ANY(%s) AND status = 'completed' ORDER BY id""",
            (ids,),
        ).fetchall()
    # Default: dokumen yang punya kasus evaluasi → bisa langsung diukur.
    return conn.execute(
        """SELECT DISTINCT d.id, d.filename, d.file_path, d.file_extension
             FROM documents d JOIN retrieval_cases rc ON rc.dokumen_id = d.id
            WHERE d.status = 'completed' AND rc.aktif
            ORDER BY d.id LIMIT %s""",
        (limit,),
    ).fetchall()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=20)
    ap.add_argument("--dokumen", type=str, default="")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--lintas-halaman", type=str, default="true")
    args = ap.parse_args()

    ids = [int(x) for x in args.dokumen.split(",") if x.strip()] if args.dokumen else None
    lintas = args.lintas_halaman.lower() != "false"

    from ingest import process_document  # impor setelah sys.path disiapkan

    with connect() as conn:
        docs = _ambil_dokumen(conn, args.limit, ids)
        print(f"[reindex] dokumen: {len(docs)} | dry-run={args.dry_run} | lintas_halaman={lintas}")

        for doc in docs:
            path = Path(doc["file_path"])
            if not path.exists():
                print(f"[reindex] LEWATI (berkas hilang): {doc['id']} {doc['filename'][:50]}")
                continue

            if args.dry_run:
                try:
                    segments = parse_document(path, doc["file_extension"], ocr=False)
                    baru = chunk_segments(segments, lintas_halaman=lintas)
                except Exception as e:  # noqa: BLE001
                    print(f"[reindex] GAGAL parse {doc['id']}: {e}")
                    continue
                lama = conn.execute(
                    "SELECT count(*) AS n FROM chunks WHERE document_id=%s AND is_outdated=FALSE",
                    (doc["id"],),
                ).fetchone()
                r = _ringkas(baru)
                print(
                    f"[reindex] {doc['id']:>4} chunk {lama['n']:>3} → {r['jumlah']:>3} "
                    f"| median {r['median_token']} tok | akhir-tanda {r['akhir_tanda_pct']}% "
                    f"| berjudul {r['ada_judul_pct']}% | {doc['filename'][:40]}"
                )
            else:
                try:
                    n = process_document(conn, doc)
                    conn.commit()
                    print(f"[reindex] OK {doc['id']:>4} → {n} chunk | {doc['filename'][:50]}")
                except Exception as e:  # noqa: BLE001
                    conn.rollback()
                    print(f"[reindex] GAGAL {doc['id']}: {e}")


if __name__ == "__main__":
    main()
