from types import SimpleNamespace

import pytest
import psycopg
import api


def handler(monkeypatch, *, error=None):
    instance = object.__new__(api.DocumentAPIHandler)
    responses = []
    closed = []

    def connect():
        if error:
            raise error
        return SimpleNamespace(execute=lambda *a: SimpleNamespace(fetchone=lambda: {'n': 3}),
                               close=lambda: closed.append(True))

    monkeypatch.setattr(instance, '_new_conn', connect)
    monkeypatch.setattr(instance, '_respond_json', lambda data, status=200: responses.append((data, status)))
    return instance, responses, closed


def test_log_message_handles_standard_http_formats(capsys):
    instance = object.__new__(api.DocumentAPIHandler)
    instance.log_message('"%s" %s %s', 'GET /api/health HTTP/1.1', '200', '-')
    instance.log_message('code %d, message %s', 404, 'Not Found')
    instance.log_message('literal')
    output = capsys.readouterr().out
    assert 'code 404, message Not Found' in output
    assert '[api] literal' in output


def test_http_alive_without_business_heartbeat_is_degraded(monkeypatch):
    instance, responses, closed = handler(monkeypatch)
    instance._handle_health()
    data, status = responses[0]
    assert status == 503
    assert data['status'] == 'degraded'
    assert data['db'] == 'ok'
    assert data['worker'] == 'stale'
    assert closed == [True]


def test_business_events_stale_detection_and_error_redaction(monkeypatch):
    clock = [100.0]
    monkeypatch.setattr(api.time, 'monotonic', lambda: clock[0])
    monkeypatch.setenv('WORKER_STALE_SEC', '10')
    monkeypatch.setattr(api, '_last_heartbeat', None)
    api.record_worker_event('loop')
    api.record_worker_event('scan')
    api.record_worker_event('process')
    api.record_worker_event('reconnect')
    instance, responses, _ = handler(monkeypatch)
    instance._handle_health()
    assert responses[-1][1] == 200
    clock[0] = 111.0
    instance._handle_health()
    assert responses[-1][1] == 503
    instance._handle_health()  # Poll HTTP tidak boleh memperbarui heartbeat bisnis.
    assert responses[-1][0]['worker'] == 'stale'
    api.record_worker_event('error', RuntimeError('/private/filename.pdf secret=abc'))
    state = api.worker_snapshot()
    assert state['last_error_type'] == 'RuntimeError'
    assert state['last_scan'] is not None
    assert state['last_process'] is not None
    assert state['last_reconnect'] is not None
    assert 'private' not in str(state)
    api.record_worker_event('loop')
    instance._handle_health()
    assert responses[-1][1] == 503  # hanya success menghapus status gangguan infrastruktur
    api.record_worker_event('success')
    instance._handle_health()
    assert responses[-1][1] == 200


@pytest.mark.parametrize('stage', ['connect', 'query'])
def test_health_database_outage_returns_sanitized_503(monkeypatch, stage):
    error = psycopg.OperationalError('secret password=abc file.pdf')
    api.record_worker_event('success')
    instance, responses, closed = handler(monkeypatch, error=error if stage == 'connect' else None)
    if stage == 'query':
        monkeypatch.setattr(instance, '_new_conn', lambda: SimpleNamespace(
            execute=lambda *a: (_ for _ in ()).throw(error), close=lambda: closed.append(True)))
    instance._handle_health()
    data, status = responses[0]
    assert status == 503
    assert data['status'] == 'degraded'
    assert data['db'] == 'unavailable'
    assert 'secret' not in str(data)
    assert 'file.pdf' not in str(data)
    assert closed == ([True] if stage == 'query' else [])


def test_private_status_includes_redacted_business_timestamps(monkeypatch):
    api.record_worker_event('scan')
    api.record_worker_event('process')
    api.record_worker_event('error', ValueError('/private/document.pdf'))
    instance, responses, _ = handler(monkeypatch)
    monkeypatch.setattr(instance, '_new_conn', lambda: SimpleNamespace(
        execute=lambda *a: SimpleNamespace(fetchall=lambda: [{'status': 'pending', 'n': 2}]),
        close=lambda: None))
    instance._handle_status()
    data, status = responses[0]
    assert status == 200
    assert data['pending'] == 2
    assert data['_worker']['last_scan'] is not None
    assert data['_worker']['last_process'] is not None
    assert data['_worker']['last_error_type'] == 'ValueError'
    assert '/private' not in str(data)


def test_retry_does_not_reset_concurrently_claimed_document(monkeypatch):
    instance, responses, _ = handler(monkeypatch)
    calls = []

    def execute(sql, params):
        calls.append(sql)
        return SimpleNamespace(fetchone=lambda: {'id': 1, 'status': 'failed'} if sql.startswith('SELECT') else None)

    monkeypatch.setattr(instance, '_new_conn', lambda: SimpleNamespace(
        execute=execute, commit=lambda: None, close=lambda: None))
    instance._handle_retry(1)
    assert responses[0][1] == 409
    assert "AND status='failed'" in calls[-1]


def test_real_http_health_reports_loop_state_and_database_outage(monkeypatch):
    import json
    from http.client import HTTPConnection
    from threading import Thread

    available = [True]

    def db_connect(self):
        if not available[0]:
            raise psycopg.OperationalError('private connection details')
        return SimpleNamespace(
            execute=lambda *a: SimpleNamespace(fetchone=lambda: {'n': 0}),
            close=lambda: None)

    monkeypatch.setattr(api.DocumentAPIHandler, '_new_conn', db_connect)
    server = api.ThreadingHTTPServer(('127.0.0.1', 0), api.DocumentAPIHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    client = HTTPConnection('127.0.0.1', server.server_port, timeout=3)
    try:
        client.request('GET', '/api/health')
        response = client.getresponse()
        assert response.status == 503
        assert json.loads(response.read())['worker'] == 'stale'
        api.record_worker_event('success')
        client.request('GET', '/api/health')
        response = client.getresponse()
        assert response.status == 200
        assert json.loads(response.read())['status'] == 'ok'
        available[0] = False
        client.request('GET', '/api/health')
        response = client.getresponse()
        assert response.status == 503
        body = response.read()
        assert b'private' not in body
        assert json.loads(body)['db'] == 'unavailable'
        client.request('GET', '/unknown')
        response = client.getresponse()
        assert response.status == 404
        response.read()
    finally:
        client.close()
        server.shutdown()
        server.server_close()
        thread.join(timeout=3)
