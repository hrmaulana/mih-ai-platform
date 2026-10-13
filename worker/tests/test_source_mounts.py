from types import SimpleNamespace

import pytest
import ingest


class ScanDB:
    def __init__(self, existing=False):
        self.calls = []
        self.existing = existing

    def execute(self, sql, params=None):
        self.calls.append((sql, params))
        return SimpleNamespace(fetchone=lambda: {'id': 1} if self.existing or sql.startswith('INSERT INTO documents') else None)

    def commit(self):
        pass


def test_scan_existing_hash_does_not_relabel_source(tmp_path):
    (tmp_path / 'synthetic.pdf').write_bytes(b'no real document')
    conn = ScanDB(existing=True)
    assert ingest.scan_dir(conn, str(tmp_path), 'sharepoint') == 0
    assert not any(sql.startswith('UPDATE documents') for sql, _ in conn.calls)


def test_raw_scan_excludes_separately_owned_source_subtrees(tmp_path):
    remote = tmp_path / 'sharepoint'
    remote.mkdir()
    (remote / 'synthetic.pdf').write_bytes(b'remote')
    (tmp_path / 'synthetic.docx').write_bytes(b'raw')
    conn = ScanDB()
    assert ingest.scan_dir(conn, str(tmp_path), 'upload', exclude_dirs=[str(remote)]) == 1
    inserts = [params for sql, params in conn.calls if sql.startswith('INSERT INTO documents')]
    assert inserts[0][0] == 'synthetic.docx'
    assert inserts[0][-1] == 'upload'


def test_watch_scans_raw_and_host_sources_without_remote_env(monkeypatch, tmp_path):
    from test_worker_recovery import StopWatch
    raw = tmp_path / 'raw'
    drive = raw / 'drive'
    sharepoint = raw / 'sharepoint'
    monkeypatch.setenv('RAW_DIR', str(raw))
    monkeypatch.setenv('DRIVE_DEST', str(drive))
    monkeypatch.setenv('SHAREPOINT_DEST', str(sharepoint))
    monkeypatch.delenv('DRIVE_REMOTE', raising=False)
    monkeypatch.delenv('SHAREPOINT_REMOTE', raising=False)
    conn = SimpleNamespace(rollback=lambda: None, close=lambda: None)
    monkeypatch.setattr(ingest, 'connect', lambda: conn)
    calls = []
    processed = []
    monkeypatch.setattr(ingest, 'scan_dir', lambda c, p, source='drive', **kw: calls.append((p, source, kw)) or 0)
    monkeypatch.setattr(ingest, 'process_pending', lambda c: processed.append(c))
    monkeypatch.setattr(ingest.time, 'sleep', lambda n: (_ for _ in ()).throw(StopWatch()))
    with pytest.raises(StopWatch):
        ingest.watch()
    assert (str(raw), 'upload', {'exclude_dirs': [str(drive), str(sharepoint)]}) in calls
    assert (str(sharepoint), 'sharepoint', {}) in calls
    assert (str(drive), 'drive', {}) in calls
    assert processed == [conn]
