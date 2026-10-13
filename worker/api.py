"""
api.py — Document Service HTTP API (stdlib only)

Menyediakan endpoint healthcheck, status dokumen, dan retry untuk worker
ingest. Berjalan di port 3200 sebagai thread latar belakang.

Endpoint:
  GET  /api/health              → {"status":"ok","uptime":N,"pending":N}
  GET  /api/documents/status    → {"pending":N,"completed":N,"failed":N,...}
  POST /api/documents/<id>/retry → reset satu dokumen failed → pending
  POST /api/documents/retry-all  → reset semua dokumen failed → pending
"""

import json
import os
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from threading import Thread, Lock
from urllib.parse import urlparse

from db import connect

_start_time = time.monotonic()
_last_heartbeat = None
_worker_lock = Lock()
_worker_events = {"last_scan": None, "last_process": None, "last_error": None,
                  "last_reconnect": None, "last_success": None,
                  "last_error_type": None, "error_active": False}


def record_worker_event(event: str, error: Exception | None = None):
    """Hanya loop bisnis melaporkan kemajuan; jangan simpan path/teks error."""
    global _last_heartbeat
    with _worker_lock:
        _last_heartbeat = time.monotonic()
        if "last_" + event in _worker_events:
            _worker_events["last_" + event] = time.time()
        if event == "error":
            _worker_events["last_error_type"] = type(error).__name__
            _worker_events["error_active"] = True
        elif event == "success":
            _worker_events["error_active"] = False


def worker_snapshot():
    with _worker_lock:
        state = dict(_worker_events)
        age = None if _last_heartbeat is None else max(0, time.monotonic() - _last_heartbeat)
    default_stale = max(300, int(os.environ.get("INGEST_INTERVAL_SEC", "30")) * 3)
    stale_after = float(os.environ.get("WORKER_STALE_SEC", str(default_stale)))
    state["heartbeat_age_sec"] = age
    state["status"] = ("stale" if age is None or age > stale_after else
                       "degraded" if state["error_active"] else "ok")
    return state


class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    """Multi-threaded HTTP server — setiap request di thread sendiri."""
    daemon_threads = True
    allow_reuse_address = True


class DocumentAPIHandler(BaseHTTPRequestHandler):
    """Handler untuk endpoint Document Service."""

    # ------------------------------------------------------------------
    # Helper
    # ------------------------------------------------------------------
    def _respond_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _new_conn(self):
        """Buka koneksi DB baru per request (thread-safe)."""
        return connect()

    # ------------------------------------------------------------------
    # Routing
    # ------------------------------------------------------------------
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")

        if path == "/api/health":
            return self._handle_health()
        elif path == "/api/documents/status":
            return self._handle_status()
        else:
            self._respond_json({"error": "endpoint tidak ditemukan"}, 404)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")

        if path == "/api/documents/retry-all":
            return self._handle_retry_all()

        # /api/documents/<id>/retry
        parts = path.split("/")
        if len(parts) == 5 and parts[1] == "api" and parts[2] == "documents" and parts[4] == "retry":
            try:
                doc_id = int(parts[3])
                return self._handle_retry(doc_id)
            except ValueError:
                self._respond_json({"error": "ID dokumen tidak valid"}, 400)
        else:
            self._respond_json({"error": "endpoint tidak ditemukan"}, 404)

    # ------------------------------------------------------------------
    # Handlers
    # ------------------------------------------------------------------
    def _handle_health(self):
        conn = None
        pending = None
        db_ok = False
        try:
            conn = self._new_conn()
            row = conn.execute(
                "SELECT COUNT(*) AS n FROM documents WHERE status='pending'"
            ).fetchone()
            pending = row["n"]
            db_ok = True
        except Exception:
            pass  # Health publik tidak boleh membocorkan error DB atau kredensial.
        finally:
            if conn is not None:
                conn.close()

        uptime = int(time.monotonic() - _start_time)
        worker = worker_snapshot()
        stale = worker["status"] != "ok" or not db_ok
        self._respond_json({
            "status": "degraded" if stale else "ok",
            "uptime": uptime,
            "pending": pending,
            "db": "ok" if db_ok else "unavailable",
            "worker": worker["status"],
        }, 503 if stale else 200)

    def _handle_status(self):
        conn = self._new_conn()
        try:
            rows = conn.execute(
                "SELECT status, COUNT(*) AS n FROM documents GROUP BY status ORDER BY status"
            ).fetchall()
            summary = {r["status"]: r["n"] for r in rows}
        finally:
            conn.close()
        summary["_worker"] = worker_snapshot()
        self._respond_json(summary)

    def _handle_retry(self, doc_id):
        conn = self._new_conn()
        try:
            doc = conn.execute(
                "SELECT id, status FROM documents WHERE id=%s", (doc_id,)
            ).fetchone()
            if not doc:
                self._respond_json({"error": "dokumen tidak ditemukan"}, 404)
                return
            if doc["status"] != "failed":
                self._respond_json(
                    {"error": f"status dokumen adalah '{doc['status']}', bukan 'failed'"},
                    409,
                )
                return
            retried = conn.execute(
                "UPDATE documents SET status='pending', error_message=NULL, updated_at=now() "
                "WHERE id=%s AND status='failed' RETURNING id", (doc_id,),
            ).fetchone()
            conn.commit()
            if not retried:
                self._respond_json({"error": "status dokumen berubah; retry dibatalkan"}, 409)
                return
            self._respond_json({
                "status": "ok",
                "message": f"dokumen {doc_id} dijadwalkan ulang",
            })
        finally:
            conn.close()

    def _handle_retry_all(self):
        conn = self._new_conn()
        try:
            cur = conn.execute(
                "UPDATE documents "
                "SET status='pending', error_message=NULL, updated_at=now() "
                "WHERE status='failed' RETURNING id"
            )
            ids = [r["id"] for r in cur.fetchall()]
            conn.commit()
            self._respond_json({
                "status": "ok",
                "retried": len(ids),
                "document_ids": ids,
            })
        finally:
            conn.close()

    # ------------------------------------------------------------------
    # Logging (ringkas)
    # ------------------------------------------------------------------
    def log_message(self, fmt, *args):
        print("[api] " + (fmt % args))


# ------------------------------------------------------------------
# Public entry point — panggil dari thread terpisah
# ------------------------------------------------------------------
def start_api_server(port: int = 3200) -> None:
    """Jalankan HTTP server di thread utama pemanggil (blocking).

    Untuk integrasi dengan worker, panggil lewat threading.Thread(target=..., daemon=True).
    """
    server = ThreadingHTTPServer(("0.0.0.0", port), DocumentAPIHandler)
    print(f"[api] server berjalan di port {port}")
    server.serve_forever()


def start_api_thread(port: int | None = None) -> Thread:
    """Start API server di thread daemon latar belakang. Kembalikan Thread-nya."""
    p = port or int(os.environ.get("API_PORT", "3200"))
    t = Thread(target=start_api_server, args=(p,), daemon=True, name="api-server")
    t.start()
    print(f"[api] thread latar belakang: port {p}")
    return t