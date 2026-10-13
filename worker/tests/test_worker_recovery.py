"""Tes pemulihan offline: dokumen sintetis, tanpa akses DB/provider nyata."""
from contextlib import contextmanager
from copy import deepcopy
from types import SimpleNamespace

import pytest
import psycopg
import ingest
import api


class TransactionDB:
    """Model transaksi lokal; transaksi bersarang memodelkan savepoint PG."""
    def __init__(self, docs):
        self.docs = deepcopy(docs)
        self.chunks = []
        self.calls = []
        self.claim_limits = []
        self.depth = 0
        self.commits = 0
        self.rollbacks = 0
        self.closed = False
        self.insert_error = None

    @contextmanager
    def transaction(self):
        snapshot = deepcopy((self.docs, self.chunks))
        self.depth += 1
        try:
            yield
        except BaseException:
            self.docs, self.chunks = snapshot
            self.rollbacks += 1
            raise
        else:
            if self.depth == 1:
                self.commits += 1
        finally:
            self.depth -= 1

    def execute(self, sql, params=None):
        self.calls.append((sql, params))
        row = None
        rows = []
        if sql.startswith("SELECT id, filename"):
            assert self.depth > 0, "claim must live in an explicit transaction"
            self.claim_limits.append(params[0])
            rows = [d for d in self.docs.values() if d['status'] == 'pending'][:params[0]]
        elif sql.startswith("UPDATE documents SET status=%s"):
            status, error, doc_id = params
            self.docs[doc_id].update(status=status, error_message=error)
        elif sql.startswith("UPDATE documents SET status='completed'"):
            count, warning, doc_id = params
            self.docs[doc_id].update(status='completed', chunk_count=count)
        elif sql.startswith("DELETE FROM chunks"):
            self.chunks = [c for c in self.chunks if c[0] != params[0]]
        elif sql.startswith("INSERT INTO chunks"):
            self.chunks.append((params[0], params[-1]))
            if self.insert_error:
                raise self.insert_error
        return SimpleNamespace(fetchall=lambda: rows, fetchone=lambda: row)

    def rollback(self):
        self.rollbacks += 1

    def commit(self):
        self.commits += 1

    def close(self):
        self.closed = True


@pytest.fixture
def document(tmp_path, monkeypatch):
    path = tmp_path / 'synthetic.pdf'
    path.write_bytes(b'test only')
    monkeypatch.setattr(ingest, 'parse_document', lambda *a, **kw: [])
    monkeypatch.setattr(ingest, 'chunk_segments', lambda s: [SimpleNamespace(
        text='synthetic', page_or_slide=1, section_title=None, chunk_index=0)])
    monkeypatch.setattr(ingest, 'embed_texts', lambda texts: [[0.0] * 1536 for _ in texts])
    return {'id': 1, 'filename': path.name, 'file_path': str(path),
            'file_extension': 'pdf', 'status': 'pending'}


@pytest.mark.parametrize('error', [psycopg.OperationalError('connection is lost'),
                                  psycopg.InterfaceError('connection closed')])
def test_insert_connection_failure_leaves_pending_no_partial_chunks(document, error):
    conn = TransactionDB({1: document})
    conn.insert_error = error
    with pytest.raises(type(error)):
        ingest.process_pending(conn)
    assert conn.docs[1]['status'] == 'pending'
    assert conn.chunks == []
    assert not any(p and p[0] == 'failed' for q, p in conn.calls if q.startswith('UPDATE documents SET status=%s'))
    assert conn.rollbacks >= 1
    assert conn.claim_limits == [1]
    conn.insert_error = None
    assert ingest.process_pending(conn) == 1
    assert conn.docs[1]['status'] == 'completed'
    assert conn.chunks == [(1, 0)]


def test_document_parse_failure_does_not_undo_prior_completion(document, monkeypatch):
    second = dict(document, id=2)
    conn = TransactionDB({1: document, 2: second})
    original = ingest.process_document

    def parse_bad_second(c, doc):
        if doc['id'] == 2:
            monkeypatch.setattr(ingest, 'parse_document', lambda *a, **kw: (_ for _ in ()).throw(ValueError('corrupt PDF')))
        return original(c, doc)

    monkeypatch.setattr(ingest, 'process_document', parse_bad_second)
    assert ingest.process_pending(conn) == 1
    assert conn.docs[1]['status'] == 'completed'
    assert conn.docs[2]['status'] == 'failed'
    assert 'corrupt PDF' in conn.docs[2]['error_message']
    assert conn.chunks == [(1, 0)]
    assert all(n == 1 for n in conn.claim_limits)


def test_retry_replaces_legacy_partial_chunks_atomically(document):
    conn = TransactionDB({1: document})
    conn.chunks = [(1, 0), (1, 99), (2, 0)]
    conn.insert_error = psycopg.OperationalError('lost on insert')
    with pytest.raises(psycopg.OperationalError):
        ingest.process_pending(conn)
    assert conn.chunks == [(1, 0), (1, 99), (2, 0)]
    conn.insert_error = None
    assert ingest.process_pending(conn) == 1
    assert conn.chunks == [(2, 0), (1, 0)]
    assert conn.docs[1]['chunk_count'] == 1


class StopWatch(BaseException):
    pass


@pytest.mark.parametrize('stage', ['scan', 'get_pending', 'insert_chunk'])
def test_watch_reconnects_failed_connection_and_continues(document, monkeypatch, tmp_path, stage):
    broken = TransactionDB({1: document})
    fresh = TransactionDB({1: document})
    connections = iter([broken, fresh])
    monkeypatch.setattr(ingest, 'connect', lambda: next(connections))
    monkeypatch.setenv('RAW_DIR', str(tmp_path / 'raw'))
    monkeypatch.setenv('DRIVE_DEST', str(tmp_path / 'drive'))
    monkeypatch.setenv('SHAREPOINT_DEST', str(tmp_path / 'sharepoint'))
    monkeypatch.setenv('INGEST_INTERVAL_SEC', '30')
    monkeypatch.delenv('DRIVE_REMOTE', raising=False)
    monkeypatch.delenv('SHAREPOINT_REMOTE', raising=False)
    original_execute = broken.execute

    def execute(sql, params=None):
        if stage == 'get_pending' and sql.startswith('SELECT id, filename'):
            raise psycopg.OperationalError('connection is lost')
        return original_execute(sql, params)

    broken.execute = execute
    if stage == 'insert_chunk':
        broken.insert_error = psycopg.InterfaceError('closed')

    def scan(conn, *args, **kw):
        if conn is broken and stage == 'scan':
            raise psycopg.OperationalError('connection is lost')
        return 0

    monkeypatch.setattr(ingest, 'scan_dir', scan)
    sleeps = []

    def sleep(seconds):
        sleeps.append(seconds)
        if len(sleeps) == 1:
            assert api.worker_snapshot()['status'] == 'degraded'
        if len(sleeps) == 2:
            state = api.worker_snapshot()
            assert state['status'] == 'ok'
            assert all(state[key] is not None for key in ['last_scan', 'last_process', 'last_error', 'last_reconnect'])
            raise StopWatch()

    monkeypatch.setattr(ingest.time, 'sleep', sleep)
    with pytest.raises(StopWatch):
        ingest.watch()
    assert broken.closed
    assert broken.docs[1]['status'] == 'pending'
    assert broken.chunks == []
    assert fresh.docs[1]['status'] == 'completed'
    assert fresh.chunks == [(1, 0)]
    assert fresh.closed
    assert sleeps == [1, 30]


def test_main_watch_starts_http_without_preconnecting_db(monkeypatch):
    import sys
    monkeypatch.setattr(sys, 'argv', ['ingest', 'watch'])
    started = []
    monkeypatch.setattr(ingest, 'start_api_thread', lambda: started.append('http'))
    monkeypatch.setattr(ingest, 'watch', lambda: started.append('watch'))
    ingest.main()
    assert started == ['http', 'watch']


@pytest.mark.parametrize('stage', ['embedding', 'missing_source', 'parser_db'])
def test_infrastructure_errors_never_become_document_failure(document, monkeypatch, stage):
    conn = TransactionDB({1: document})
    if stage == 'embedding':
        monkeypatch.setattr(ingest, 'embed_texts', lambda texts: (_ for _ in ()).throw(RuntimeError('provider policy unavailable')))
    elif stage == 'missing_source':
        from pathlib import Path
        Path(document['file_path']).unlink()
    else:
        monkeypatch.setattr(ingest, 'parse_document', lambda *a, **kw: (_ for _ in ()).throw(psycopg.OperationalError('lost')))
    with pytest.raises((RuntimeError, FileNotFoundError, psycopg.OperationalError)):
        ingest.process_pending(conn)
    assert conn.docs[1]['status'] == 'pending'
    assert conn.chunks == []


def test_watch_startup_connect_failure_uses_bounded_exponential_backoff(monkeypatch, tmp_path):
    conn = TransactionDB({})
    attempts = []
    sleeps = []
    for key in ['RAW_DIR', 'DRIVE_DEST', 'SHAREPOINT_DEST']:
        monkeypatch.setenv(key, str(tmp_path / key))
    monkeypatch.delenv('DRIVE_REMOTE', raising=False)
    monkeypatch.delenv('SHAREPOINT_REMOTE', raising=False)
    monkeypatch.setenv('DB_RECONNECT_MAX_SEC', '4')
    monkeypatch.setenv('INGEST_INTERVAL_SEC', '30')

    def connect():
        attempts.append(True)
        if len(attempts) < 5:
            raise psycopg.OperationalError('DB unavailable at boot')
        return conn

    def sleep(seconds):
        sleeps.append(seconds)
        if len(sleeps) == 5:
            raise StopWatch()

    monkeypatch.setattr(ingest, 'connect', connect)
    monkeypatch.setattr(ingest, 'scan_dir', lambda *a, **kw: 0)
    monkeypatch.setattr(ingest.time, 'sleep', sleep)
    with pytest.raises(StopWatch):
        ingest.watch()
    assert sleeps == [1, 2, 4, 4, 30]
    assert conn.closed
    assert api.worker_snapshot()['status'] == 'ok'


def test_document_commit_reports_progress_before_next_claim(document, monkeypatch):
    conn = TransactionDB({1: document, 2: dict(document, id=2)})
    original = ingest.process_document

    def process(c, doc):
        if doc['id'] == 2:
            assert api.worker_snapshot()['last_process'] is not None
        return original(c, doc)

    monkeypatch.setattr(ingest, 'process_document', process)
    assert ingest.process_pending(conn) == 2


def test_main_scan_closes_connection_on_infrastructure_failure(monkeypatch):
    import sys
    conn = TransactionDB({})
    monkeypatch.setattr(sys, 'argv', ['ingest', 'scan', '--dir', '/synthetic'])
    monkeypatch.setattr(ingest, 'start_api_thread', lambda: None)
    monkeypatch.setattr(ingest, 'connect', lambda: conn)
    monkeypatch.setattr(ingest, 'scan_dir', lambda *a: (_ for _ in ()).throw(psycopg.OperationalError('lost')))
    with pytest.raises(psycopg.OperationalError):
        ingest.main()
    assert conn.closed
