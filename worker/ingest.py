import argparse
import hashlib
import os
import subprocess
import time
from pathlib import Path

import psycopg

from api import start_api_thread, record_worker_event

from chunking import chunk_segments
from db import (connect, complete_document, ensure_raw_document, get_pending,
                insert_chunk, mark_outdated_same_filename, set_status,
                file_path_ext, SUPPORTED_EXTENSIONS)
from embedding import embed_texts
from parsers import parse_document


class DocumentFailure(Exception):
    """Konten dokumen rusak, bukan gangguan DB/provider/sumber."""


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(65536), b""):
            h.update(block)
    return h.hexdigest()


def classify_file(filename: str) -> str:
    ext = Path(filename).suffix.lower().lstrip(".")
    if ext == "pptx":
        return "paparan"
    if ext in ("pdf", "docx"):
        return "laporan"
    return "lainnya"


def scan_dir(conn, dirpath: str, source: str = "drive", *, exclude_dirs=()) -> int:
    added = 0
    excluded = [Path(directory).resolve() for directory in exclude_dirs]
    for path in sorted(Path(dirpath).rglob("*")):
        if any(path.resolve().is_relative_to(directory) for directory in excluded):
            continue
        if not path.is_file():
            continue
        if file_path_ext(path.name) not in SUPPORTED_EXTENSIONS:
            continue
        sha = sha256_file(path)
        if ensure_raw_document(conn, path.name, str(path), sha, classify_file(path.name), source):
            added += 1
    conn.commit()
    return added


def _extract_chunks(path: Path, doc):
    """Parse dokumen → chunks + halaman yang perlu OCR. Galat mount/DB diteruskan apa adanya."""
    ocr = os.environ.get("OCR_ENABLED", "1") in ("1", "true", "True")
    try:
        segments = parse_document(path, doc["file_extension"], ocr=ocr)
        ocr_pages = [s.page_or_slide for s in segments if s.needs_ocr]
        chunks = chunk_segments(segments)
        if not chunks:
            raise ValueError("tidak ada teks terekstrak — kemungkinan hasil scan, perlu OCR")
    except (OSError, psycopg.Error):
        # Gangguan mount/DB bisa pulih; dokumen tetap pending.
        raise
    except Exception as exc:
        raise DocumentFailure(str(exc)) from exc
    return chunks, ocr_pages


def _embed_chunks(chunks) -> list[list[float]]:
    vectors = embed_texts([c.text for c in chunks])
    if len(vectors) != len(chunks):
        raise ValueError(f"jumlah embedding {len(vectors)} != jumlah chunk {len(chunks)}")
    return vectors


def process_document(conn, doc) -> int:
    """Proses dalam transaksi/lock claim milik process_pending, tanpa commit."""
    doc_id = doc["id"]
    set_status(conn, doc_id, "processing")
    path = Path(doc["file_path"])
    if not path.exists():
        raise FileNotFoundError(f"file tidak ditemukan: {path}")
    chunks, ocr_pages = _extract_chunks(path, doc)
    vectors = _embed_chunks(chunks)
    # Ganti, bukan tambah: pemanggil memegang lock baris dokumen; penghapusan
    # ikut rollback bersama insert/status bila penulisan mana pun gagal.
    conn.execute("DELETE FROM chunks WHERE document_id=%s", (doc_id,))
    for c, v in zip(chunks, vectors):
        insert_chunk(conn, doc_id, c, v)
    mark_outdated_same_filename(conn, doc["filename"], doc_id)
    warning = f"perlu OCR pada halaman {ocr_pages}" if ocr_pages else None
    complete_document(conn, doc_id, len(chunks), warning)
    return len(chunks)


def process_pending(conn, limit: int = 10) -> int:
    done = 0
    for _ in range(limit):
        # Claim berupa lock baris sampai commit dokumen ini. Status processing
        # tidak di-commit terpisah, sehingga koneksi putus tidak meninggalkan lease.
        with conn.transaction():
            docs = get_pending(conn, 1)
            if not docs:
                break
            doc = docs[0]
            try:
                # Savepoint mempertahankan lock claim jika parsing gagal. Worker lain
                # tidak bisa claim di sela rollback parsial dan penandaan failed.
                with conn.transaction():
                    n = process_document(conn, doc)
            except DocumentFailure as exc:
                set_status(conn, doc["id"], "failed", str(exc))
                n = None
        record_worker_event("process")
        if n is not None:
            print(f"ok doc={doc['id']} chunks={n}")
            done += 1
    return done


def _rclone_sync(remote: str, dest: str, label: str) -> bool:
    """Salin via rclone copy tanpa menghapus file lokal. Lempar RuntimeError bila gagal."""
    conf = os.environ.get("RCLONE_CONFIG", "")
    if conf and not Path(conf).is_file():
        raise RuntimeError(f"rclone.conf tidak ditemukan: {conf} (jalankan rclone config lalu scp ke server)")
    Path(dest).mkdir(parents=True, exist_ok=True)
    cmd = [
        "rclone", "copy", remote, dest,
        "--include", "*.pdf", "--include", "*.pptx", "--include", "*.docx",
        "--ignore-case",
        "--transfers", "4", "--log-level", "ERROR",
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"rclone copy {label} gagal (rc={proc.returncode}): {proc.stderr.strip()}")
    print(f"{label}-sync: ok dari {remote}")
    return True


def drive_sync() -> bool:
    """Sinkronisasi folder Google Drive ke DRIVE_DEST via rclone. Kembalikan True bila sinkron."""
    remote = os.environ.get("DRIVE_REMOTE", "")
    if not remote:
        print("DRIVE_REMOTE tidak diset — lewati sinkronisasi Drive")
        return False
    return _rclone_sync(remote, os.environ.get("DRIVE_DEST", "/data/raw/drive"), "drive")


def sharepoint_sync() -> bool:
    """Sinkronisasi library SharePoint (rclone onedrive backend) ke SHAREPOINT_DEST."""
    remote = os.environ.get("SHAREPOINT_REMOTE", "")
    if not remote:
        print("SHAREPOINT_REMOTE tidak diset — lewati sinkronisasi SharePoint")
        return False
    return _rclone_sync(remote, os.environ.get("SHAREPOINT_DEST", "/data/raw/sharepoint"), "sharepoint")


def prune_removed(conn, source: str = "drive") -> int:
    """No-op kompatibilitas: file hilang bukan bukti penghapusan remote.

    Gangguan mount/sinkronisasi tidak boleh menghapus metadata maupun chunks.
    Pengarsipan/penghapusan membutuhkan kebijakan terpisah yang disetujui.
    """
    return 0


def maybe_drive_sync(conn, last_sync: float, interval_min: int) -> float:
    """Copy Drive bila interval terlampaui; jangan hapus dokumen."""
    if not os.environ.get("DRIVE_REMOTE"):
        return last_sync
    now = time.time()
    if now - last_sync < interval_min * 60:
        return last_sync
    if drive_sync():
        scan_dir(conn, os.environ.get("DRIVE_DEST", "/data/raw/drive"))
    return now


def maybe_sharepoint_sync(conn, last_sync: float, interval_min: int) -> float:
    """Copy SharePoint bila interval terlampaui; jangan hapus dokumen."""
    if not os.environ.get("SHAREPOINT_REMOTE"):
        return last_sync
    now = time.time()
    if now - last_sync < interval_min * 60:
        return last_sync
    if sharepoint_sync():
        scan_dir(conn, os.environ.get("SHAREPOINT_DEST", "/data/raw/sharepoint"), "sharepoint")
    return now


def _discard_connection(conn):
    if conn is None:
        return
    try:
        conn.rollback()
    except Exception:
        pass  # Sesi terputus mungkin tidak menerima ROLLBACK lagi.
    try:
        conn.close()
    except Exception:
        pass


def watch():
    conn = None
    raw_dir = os.environ.get("RAW_DIR", "/data/raw")
    drive_dest = os.environ.get("DRIVE_DEST", "/data/raw/drive")
    sp_dest = os.environ.get("SHAREPOINT_DEST", "/data/raw/sharepoint")
    interval = int(os.environ.get("INGEST_INTERVAL_SEC", "30"))
    sync_interval_min = int(os.environ.get("DRIVE_SYNC_INTERVAL_MIN", "15"))
    Path(raw_dir).mkdir(parents=True, exist_ok=True)
    Path(drive_dest).mkdir(parents=True, exist_ok=True)
    Path(sp_dest).mkdir(parents=True, exist_ok=True)
    print(f"watch aktif: {raw_dir} setiap {interval}s, drive-sync tiap {sync_interval_min}m")
    last_sync = 0.0
    last_sp_sync = 0.0
    backoff = 1
    max_backoff = max(1, int(os.environ.get("DB_RECONNECT_MAX_SEC", "60")))
    try:
        while True:
            try:
                record_worker_event("loop")
                if conn is None:
                    conn = connect()
                    record_worker_event("reconnect")
                last_sync = maybe_drive_sync(conn, last_sync, sync_interval_min)
                last_sp_sync = maybe_sharepoint_sync(conn, last_sp_sync, sync_interval_min)
                added = scan_dir(conn, raw_dir, "upload", exclude_dirs=[drive_dest, sp_dest])
                added += scan_dir(conn, drive_dest)
                added += scan_dir(conn, sp_dest, "sharepoint")
                record_worker_event("scan")
                if added:
                    print(f"scan: {added} dokumen baru diantrekan")
                process_pending(conn)
                record_worker_event("process")
                record_worker_event("success")
            except Exception as exc:
                # Jangan gunakan ulang koneksi rusak/aborted. Coba sesi baru;
                # kesalahan parsing dokumen ditangani secara per-dokumen.
                record_worker_event("error", exc)
                print(f"watch gagal: {type(exc).__name__}")
                _discard_connection(conn)
                conn = None
                time.sleep(backoff)
                backoff = min(backoff * 2, max_backoff)
                continue
            backoff = 1
            time.sleep(interval)
    finally:
        _discard_connection(conn)


def main():
    parser = argparse.ArgumentParser(prog="ingest")
    sub = parser.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("scan")
    s.add_argument("--dir", default="/data/raw")
    s.add_argument("--source", default="drive", choices=["drive", "sharepoint", "upload"])
    sub.add_parser("watch")
    sub.add_parser("drive-sync")
    sub.add_parser("sharepoint-sync")
    args = parser.parse_args()

    start_api_thread()
    if args.cmd == "watch":
        watch()
        return

    conn = connect()
    try:
        if args.cmd == "scan":
            n = scan_dir(conn, args.dir, args.source)
            process_pending(conn)
            print(f"siap: {n} dokumen baru diantrekan")
        elif args.cmd == "drive-sync":
            if drive_sync():
                n = scan_dir(conn, os.environ.get("DRIVE_DEST", "/data/raw/drive"))
                print(f"drive-sync: {n} dokumen baru diantrekan")
                process_pending(conn)
        elif args.cmd == "sharepoint-sync":
            if sharepoint_sync():
                n = scan_dir(conn, os.environ.get("SHAREPOINT_DEST", "/data/raw/sharepoint"), "sharepoint")
                print(f"sharepoint-sync: {n} dokumen baru diantrekan")
                process_pending(conn)
    finally:
        _discard_connection(conn)


if __name__ == "__main__":
    main()
