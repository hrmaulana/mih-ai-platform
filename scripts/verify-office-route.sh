#!/usr/bin/env bash
# GET-only probe. No login, POST, service operations, or credential generation.
set -euo pipefail
exec python3 - "$@" <<'PY'
import argparse
import hashlib
import json
import os
import re
import stat
import sys
import urllib.error
import urllib.parse
import urllib.request

class GateError(Exception):
    pass

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

p = argparse.ArgumentParser(description='Read-only MIH office route/auth/data signature gate')
p.add_argument('--office-base', help='Office frontend URL, required for capture')
p.add_argument('--target-base', help='VPS loopback tunnel or public HTTPS URL')
p.add_argument('--auth-header-file', help='Mode 600 file: one real Cookie: or Authorization: header')
p.add_argument('--expected-office-signature', help='JSON captured from verified office origin, not VPS')
p.add_argument('--capture-office', action='store_true', help='Print office signature JSON to stdout')
p.add_argument('--expect-maintenance', action='store_true', help='Assert HTTP 503 for frontend and APIs; no auth required')
p.add_argument('--timeout', type=float, default=20)
a = p.parse_args()
opener = urllib.request.build_opener(NoRedirect())
paths = ('/api/auth/me', '/api/admin/documents', '/api/early-warning?limit=1')

def base_url(value):
    u = urllib.parse.urlsplit(value or '')
    if u.scheme not in ('http', 'https') or not u.hostname or u.username or u.password or u.query or u.fragment or u.path not in ('', '/'):
        raise GateError('base URL must be HTTP(S) origin without credentials/path/query')
    if u.scheme == 'http' and u.hostname not in ('localhost', '127.0.0.1', '::1'):
        raise GateError('cleartext HTTP allowed only on loopback; use HTTPS for public origin')
    return value.rstrip('/')

def fetch(base, path, header=None):
    headers = {'Accept': 'application/json' if path.startswith('/api/') else 'text/html', 'Cache-Control': 'no-cache'}
    if header:
        headers[header[0]] = header[1]
    req = urllib.request.Request(base + path, headers=headers, method='GET')
    try:
        with opener.open(req, timeout=a.timeout) as r:
            body = r.read(32 * 1024 * 1024 + 1)
            if len(body) > 32 * 1024 * 1024:
                raise GateError('response too large')
            return r.status, r.headers, body
    except urllib.error.HTTPError as e:
        code, headers = e.code, e.headers
        e.close()
        return code, headers, b''
    except (urllib.error.URLError, TimeoutError, OSError):
        raise GateError('network/TLS failure (details suppressed to protect credentials)')

def data(base, path, header):
    code, headers, body = fetch(base, path, header)
    if code != 200 or 'application/json' not in headers.get('Content-Type', '').lower():
        raise GateError('authenticated JSON endpoint failed: ' + path + ' HTTP ' + str(code))
    try:
        return json.loads(body)
    except ValueError:
        raise GateError('invalid JSON: ' + path)

def auth_header():
    if not a.auth_header_file:
        raise GateError('AUTH BLOCKED: supply real existing session/token via mode-600 --auth-header-file; no auth fabricated')
    fd = os.open(a.auth_header_file, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, 'r') as f:
        s = os.fstat(f.fileno())
        if not stat.S_ISREG(s.st_mode) or stat.S_IMODE(s.st_mode) != 0o600 or s.st_uid != os.getuid():
            raise GateError('auth header file must be owned by current user, regular, mode 600')
        text = f.read(16385).strip()
    if len(text) > 16384 or '\n' in text or '\r' in text or ':' not in text:
        raise GateError('auth file must contain exactly one credential header')
    name, value = text.split(':', 1)
    value = value.strip()
    if name == 'Cookie' and re.fullmatch(r'mih_session=[^;\s]+', value):
        return name, value
    if name == 'Authorization' and re.fullmatch(r'Bearer [^\s]+', value):
        return name, value
    raise GateError('only a single mih_session Cookie or Bearer Authorization header is allowed')

def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()

def signature(base, header):
    # Unauthenticated denials are necessary but are NOT a database identity proof.
    for path in paths:
        code, _, _ = fetch(base, path)
        if code != 401:
            raise GateError('anonymous auth gate failed: ' + path + ' HTTP ' + str(code))
    me = data(base, paths[0], header)
    docs = data(base, paths[1], header)
    news = data(base, paths[2], header)
    if not isinstance(me.get('user'), dict) or not isinstance(me['user'].get('id'), int):
        raise GateError('real authenticated user proof missing')
    if not isinstance(docs, list) or not docs:
        raise GateError('documents must be a nonempty array')
    canonical = []
    for d in docs:
        if not isinstance(d, dict) or not all(k in d for k in ('id', 'status', 'chunk_count', 'updated_at')):
            raise GateError('document signature fields missing')
        chunks = int(d['chunk_count'])
        if chunks < 0:
            raise GateError('invalid chunk count')
        canonical.append({'id': int(d['id']), 'status': d['status'], 'chunk_count': chunks, 'updated_at': d['updated_at']})
    canonical.sort(key=lambda d: d['id'])
    if len({d['id'] for d in canonical}) != len(canonical):
        raise GateError('duplicate document IDs')
    rows = news['data']
    total = int(news['meta']['total'])
    if not isinstance(rows, list) or total < 1 or not rows or 'id' not in rows[0] or 'fetched_at' not in rows[0]:
        raise GateError('news signature missing')
    code, headers, html = fetch(base, '/')
    if code != 200 or 'text/html' not in headers.get('Content-Type', '').lower() or not re.search(rb'<(?:html|!doctype)', html, re.I):
        raise GateError('frontend HTML proof failed')
    # HTML/bundle references equality is useful but cannot prove streaming delivery.
    return {'schema': 1, 'documents': {'count': len(canonical), 'chunks': sum(d['chunk_count'] for d in canonical), 'sha256': digest(canonical)},
            'news': {'total': total, 'latest_id': rows[0]['id'], 'latest_fetched_at': rows[0]['fetched_at']},
            'frontend_sha256': hashlib.sha256(html).hexdigest(),
            'user': {'id': me['user']['id'], 'is_admin': me['user'].get('is_admin')}}

try:
    if a.timeout <= 0:
        raise GateError('timeout must be positive')
    if a.expect_maintenance:
        if a.capture_office or not a.target_base or a.auth_header_file:
            raise GateError('maintenance mode requires target only, without auth/capture')
        target = base_url(a.target_base)
        for path in ('/',) + paths:
            code, _, _ = fetch(target, path)
            if code != 503:
                raise GateError('maintenance must return 503: ' + path + ' HTTP ' + str(code))
        print('PASS maintenance frontend/API 503; no stale fallback observed')
    else:
        header = auth_header()
        if a.capture_office:
            if not a.office_base or a.target_base or a.expected_office_signature:
                raise GateError('capture requires office-base only; independently verify that origin is office')
            print(json.dumps(signature(base_url(a.office_base), header), sort_keys=True))
        else:
            if not a.target_base or not a.expected_office_signature:
                raise GateError('target-base and independently captured expected-office-signature are required')
            with open(a.expected_office_signature) as f:
                expected = json.load(f)
            if expected.get('schema') != 1 or not all(k in expected for k in ('documents', 'news', 'frontend_sha256', 'user')):
                raise GateError('invalid office baseline schema')
            if a.office_base and signature(base_url(a.office_base), header) != expected:
                raise GateError('office changed since baseline; recapture in controlled window, do not weaken gate')
            actual = signature(base_url(a.target_base), header)
            if actual != expected:
                raise GateError('target differs from verified office DB/news/UI/auth signature; cutover BLOCKED')
            print('PASS target matches office DB/news/UI/auth signature; streaming and backup gates remain separate')
except (GateError, OSError, ValueError, KeyError, TypeError, AttributeError) as e:
    # Only GateError messages are operator-safe; never print server JSON or credentials.
    print('FAIL ' + (str(e) if isinstance(e, GateError) else 'invalid/unavailable input or response shape'), file=sys.stderr)
    sys.exit(1)
PY
