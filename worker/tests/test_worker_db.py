from types import SimpleNamespace

import db


def test_connect_bounded_and_autocommit_leaves_claim_transaction_explicit(monkeypatch):
    calls = []
    monkeypatch.setenv('DATABASE_URL', 'postgresql://synthetic/unused')
    monkeypatch.setattr(db.psycopg, 'connect', lambda *a, **kw: calls.append((a, kw)))
    # Ambil fungsi asli dari modul: fixture menutup akses DB nyata.
    import importlib.util
    original = importlib.util.spec_from_file_location('offline_db', db.__file__)
    module = importlib.util.module_from_spec(original)
    original.loader.exec_module(module)
    module.connect()
    kwargs = calls[0][1]
    assert kwargs['autocommit'] is True
    assert kwargs['connect_timeout'] == 10
    assert 'statement_timeout=15000' in kwargs['options']


def test_scan_insert_race_uses_hash_conflict_without_aborting():
    calls = []
    conn = SimpleNamespace(execute=lambda sql, params: calls.append(sql) or SimpleNamespace(fetchone=lambda: None))
    assert db.ensure_raw_document(conn, 'synthetic.pdf', '/synthetic/test.pdf', 'sha', 'laporan') is False
    assert 'ON CONFLICT (sha256) DO NOTHING' in calls[-1]
