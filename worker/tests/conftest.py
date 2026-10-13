"""Tes worker fail-closed: tanpa DB produksi ataupun embedding eksternal."""
import pytest
import api
import db
import embedding
import ingest


@pytest.fixture(autouse=True)
def isolated_worker(monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError('Live DB/provider calls forbidden in worker unit tests')

    monkeypatch.setattr(db, 'connect', forbidden)
    monkeypatch.setattr(api, 'connect', forbidden)
    monkeypatch.setattr(ingest, 'connect', forbidden)
    monkeypatch.setattr(embedding, 'embed_texts', forbidden)
    monkeypatch.setattr(ingest, 'embed_texts', forbidden)
    monkeypatch.setattr(api, '_last_heartbeat', None)
    monkeypatch.setattr(api, '_worker_events', {
        'last_scan': None, 'last_process': None, 'last_error': None,
        'last_reconnect': None, 'last_success': None,
        'last_error_type': None, 'error_active': False,
    })
