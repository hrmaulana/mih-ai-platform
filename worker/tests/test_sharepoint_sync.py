import time
from types import SimpleNamespace

from ingest import scan_dir
import ingest
import pytest
import psycopg


class FakeConn:
    """conn fiktif: execute() return objek dengan fetchone()/fetchall() yang bisa diskenario."""

    def __init__(self, fetchall_result=None):
        self.calls = []
        self._fetchall_result = fetchall_result or []

    def execute(self, sql, params=None):
        self.calls.append((sql, params))
        result = SimpleNamespace(fetchone=lambda: {"id": 1} if sql.startswith("INSERT INTO documents") else None, fetchall=lambda: self._fetchall_result)
        return result

    def commit(self):
        pass


def test_sharepoint_sync_panggil_rclone(monkeypatch, tmp_path):
    calls = []

    def fake_run(cmd, **kw):
        calls.append(cmd)
        return SimpleNamespace(returncode=0, stderr="")

    monkeypatch.setattr(ingest.subprocess, "run", fake_run)
    monkeypatch.setenv("SHAREPOINT_REMOTE", "sp:")
    monkeypatch.setenv("SHAREPOINT_DEST", str(tmp_path))
    monkeypatch.delenv("RCLONE_CONFIG", raising=False)
    assert ingest.sharepoint_sync() is True
    cmd = calls[0]
    assert cmd[0] == "rclone" and cmd[1] == "copy"
    assert "sp:" in cmd
    assert str(tmp_path) in cmd
    assert "--include" in cmd


def test_sharepoint_sync_lewati_jika_env_kosong(monkeypatch):
    monkeypatch.delenv("SHAREPOINT_REMOTE", raising=False)
    assert ingest.sharepoint_sync() is False


def test_sharepoint_sync_raise_saat_rclone_gagal(monkeypatch, tmp_path):
    monkeypatch.setattr(
        ingest.subprocess, "run",
        lambda cmd, **kw: SimpleNamespace(returncode=1, stderr="auth failed"),
    )
    monkeypatch.setenv("SHAREPOINT_REMOTE", "sp:x")
    monkeypatch.setenv("SHAREPOINT_DEST", str(tmp_path))
    import pytest
    with pytest.raises(RuntimeError):
        ingest.sharepoint_sync()


def test_scan_dir_source_sharepoint(tmp_path):
    (tmp_path / "a.pdf").write_bytes(b"abc")
    conn = FakeConn()
    n = scan_dir(conn, str(tmp_path), "sharepoint")
    assert n == 1
    inserts = [c for c in conn.calls if c[0].startswith("INSERT INTO documents")]
    assert inserts[0][1][-1] == "sharepoint"


def test_prune_removed_tidak_menghapus_source_sharepoint(tmp_path):
    ada = tmp_path / "ada.pdf"
    ada.write_bytes(b"x")
    conn = FakeConn([
        {"id": 1, "file_path": str(ada)},
        {"id": 2, "file_path": str(tmp_path / "hilang.pdf")},
    ])
    n = ingest.prune_removed(conn, "sharepoint")
    assert n == 0
    assert not conn.calls



def test_maybe_sharepoint_sync_interval(monkeypatch):
    ran = {"sp": 0, "prune": 0}
    monkeypatch.setenv("SHAREPOINT_REMOTE", "sp:x")
    monkeypatch.setattr(ingest, "sharepoint_sync", lambda: (ran.__setitem__("sp", ran["sp"] + 1) or True))
    monkeypatch.setattr(ingest, "prune_removed", lambda conn, source="drive": (ran.__setitem__("prune", ran["prune"] + 1) or 0))
    monkeypatch.setattr(ingest, "scan_dir", lambda conn, d, source="drive": 0)
    last = ingest.maybe_sharepoint_sync(object(), time.time(), 15)
    assert ran["sp"] == 0  # interval belum lewat -> lewati
    last = ingest.maybe_sharepoint_sync(object(), 0, 0)  # interval 0 -> selalu sync
    assert ran["sp"] == 1 and ran["prune"] == 0
    ingest.maybe_sharepoint_sync(object(), last, 0)
    assert ran["sp"] == 2


@pytest.mark.parametrize('kind', ['drive', 'sharepoint'])
def test_sync_scan_db_failure_reaches_watch_recovery(monkeypatch, kind):
    monkeypatch.setenv(kind.upper() + '_REMOTE', 'synthetic:folder')
    monkeypatch.setattr(ingest, kind + '_sync', lambda: True)
    monkeypatch.setattr(ingest, 'scan_dir', lambda *a, **kw: (_ for _ in ()).throw(psycopg.OperationalError('lost')))
    with pytest.raises(psycopg.OperationalError):
        getattr(ingest, 'maybe_' + kind + '_sync')(object(), 0, 0)
