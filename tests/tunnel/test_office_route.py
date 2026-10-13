"""Isolated fixtures only: no production URLs, keys, login or database writes."""
import contextlib
import http.server
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import threading
import time
from typing import cast
import unittest
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / 'scripts/verify-office-route.sh'
NGINX_TEMPLATE = ROOT / 'deploy/nginx/mih-office-proxy.conf'
AUTH = 'fixture-only-not-a-real-session'

class FixtureServer(http.server.ThreadingHTTPServer):
    mode: str = 'office'
    calls: list[tuple[str, str]]
    redirect: str = 'http://127.0.0.1:1/'

class Fixture(http.server.BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    @property
    def fixture_server(self):
        return cast(FixtureServer, self.server)

    def log_message(self, format, *args):
        pass

    def do_GET(self):
        self.fixture_server.calls.append((self.command, self.path))
        mode = self.fixture_server.mode
        if mode == 'maintenance':
            self.send(503, b'maintenance fixture', 'text/plain')
            return
        if mode == 'redirect':
            self.send(302, b'', 'text/plain', [('Location', self.fixture_server.redirect)])
            return
        if self.path == '/fixture-stream':
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Connection', 'close')
            self.end_headers()
            self.wfile.write(b'data: first\n\n')
            self.wfile.flush()
            time.sleep(0.8)
            self.wfile.write(b'data: second\n\n')
            self.wfile.flush()
            self.close_connection = True
            return
        if self.path == '/':
            self.send(200, b'<!doctype html><html><script src="/assets/fixture.js"></script></html>', 'text/html')
            return
        if not self.path.startswith('/api/'):
            self.send(404, b'', 'text/plain')
            return
        if self.headers.get('Cookie') != 'mih_session=' + AUTH:
            self.send(200 if mode == 'anonymous-open' else 401, b'{"error":"fixture denial"}', 'application/json')
            return
        if mode == 'bad-auth':
            self.send(401, b'{}', 'application/json')
            return
        if mode == 'spa-api':
            self.send(200, b'<html>SPA fallback</html>', 'text/html')
            return
        if self.path == '/api/auth/me':
            body = {'user': {'id': 7, 'is_admin': False}}
        elif self.path == '/api/admin/documents':
            # Deliberately tiny synthetic fixture counts, NEVER production output.
            body = [{'id': 2, 'status': 'completed', 'chunk_count': 9 if mode == 'stale' else 3, 'updated_at': 'fixture-v1'},
                    {'id': 1, 'status': 'pending', 'chunk_count': 0, 'updated_at': 'fixture-v1'}]
        elif self.path == '/api/early-warning?limit=1':
            body = {'meta': {'total': 2}, 'data': [{'id': 3, 'fetched_at': 'fixture-time'}]}
        else:
            self.send(404, b'{}', 'application/json')
            return
        self.send(200, json.dumps(body).encode(), 'application/json')

    def send(self, code, body, content_type, headers=()):
        self.send_response(code)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        for k, v in headers:
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

@contextlib.contextmanager
def server(mode='office'):
    s = FixtureServer(('127.0.0.1', 0), Fixture)
    s.daemon_threads = True
    s.mode, s.calls, s.redirect = mode, [], 'http://127.0.0.1:1/'
    t = threading.Thread(target=s.serve_forever, daemon=True)
    t.start()
    try:
        yield s, 'http://127.0.0.1:' + str(s.server_port)
    finally:
        s.shutdown()
        s.server_close()
        t.join()

class RouteTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='mih-route-fixture-')
        self.addCleanup(self.tmp.cleanup)
        self.auth = Path(self.tmp.name) / 'auth.header'
        self.auth.write_text('Cookie: mih_session=' + AUTH + '\n')
        self.auth.chmod(0o600)
        self.baseline = Path(self.tmp.name) / 'baseline.json'

    def run_script(self, *args, auth=True):
        env = dict(os.environ, NO_PROXY='127.0.0.1,localhost', no_proxy='127.0.0.1,localhost')
        argv = ['bash', str(SCRIPT), *map(str, args)]
        if auth:
            argv += ['--auth-header-file', str(self.auth)]
        r = subprocess.run(argv, capture_output=True, text=True, timeout=15, env=env)
        self.assertNotIn(AUTH, r.stdout + r.stderr)
        return r

    def capture(self, url):
        r = self.run_script('--office-base', url, '--capture-office')
        self.assertEqual(r.returncode, 0, r.stderr)
        self.baseline.write_text(r.stdout)
        return json.loads(r.stdout)

    def compare(self, url):
        return self.run_script('--target-base', url, '--expected-office-signature', self.baseline)

    def test_match_and_get_only(self):
        with server() as (office, office_url), server() as (target, target_url):
            sig = self.capture(office_url)
            self.assertEqual(sig['documents']['count'], 2)
            self.assertEqual(sig['documents']['chunks'], 3)
            r = self.compare(target_url)
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertIn('PASS target matches', r.stdout)
            self.assertTrue(all(method == 'GET' for method, _ in office.calls + target.calls))
            self.assertEqual(len(target.calls), 7)

    def test_stale_target_blocked(self):
        with server() as (_, office), server('stale') as (_, target):
            self.capture(office)
            r = self.compare(target)
            self.assertNotEqual(r.returncode, 0)
            self.assertIn('cutover BLOCKED', r.stderr)

    def test_missing_real_auth_blocks_without_requests(self):
        with server() as (s, url):
            r = self.run_script('--office-base', url, '--capture-office', auth=False)
            self.assertNotEqual(r.returncode, 0)
            self.assertIn('AUTH BLOCKED', r.stderr)
            self.assertEqual(s.calls, [])

    def test_invalid_auth_is_not_success(self):
        with server('bad-auth') as (_, url):
            r = self.run_script('--office-base', url, '--capture-office')
            self.assertNotEqual(r.returncode, 0)
            self.assertIn('HTTP 401', r.stderr)

    def test_anonymous_access_is_not_gate_proof(self):
        with server('anonymous-open') as (_, url):
            r = self.run_script('--office-base', url, '--capture-office')
            self.assertNotEqual(r.returncode, 0)
            self.assertIn('anonymous auth gate failed', r.stderr)

    def test_spa_200_is_not_api_health(self):
        with server('spa-api') as (_, url):
            r = self.run_script('--office-base', url, '--capture-office')
            self.assertNotEqual(r.returncode, 0)
            self.assertIn('authenticated JSON endpoint failed', r.stderr)

    def test_maintenance_and_no_false_positive(self):
        with server('maintenance') as (_, url):
            r = self.run_script('--target-base', url, '--expect-maintenance', auth=False)
            self.assertEqual(r.returncode, 0, r.stderr)
        with server() as (_, url):
            r = self.run_script('--target-base', url, '--expect-maintenance', auth=False)
            self.assertNotEqual(r.returncode, 0)

    def test_redirect_not_followed(self):
        with server() as (sink, sink_url), server('redirect') as (s, url):
            s.redirect = sink_url
            r = self.run_script('--office-base', url, '--capture-office')
            self.assertNotEqual(r.returncode, 0)
            self.assertEqual(sink.calls, [])

    def test_auth_permissions_and_symlink_rejected(self):
        self.auth.chmod(0o644)
        r = self.run_script('--office-base', 'http://127.0.0.1:1', '--capture-office')
        self.assertNotEqual(r.returncode, 0)
        self.assertIn('mode 600', r.stderr)
        self.auth.chmod(0o600)
        link = self.auth.with_name('symlink')
        link.symlink_to(self.auth)
        self.auth = link
        self.assertNotEqual(self.run_script('--office-base', 'http://127.0.0.1:1', '--capture-office').returncode, 0)

    def test_url_credentials_cleartext_public_and_missing_baseline_blocked(self):
        for url in ('http://example.invalid', 'https://user:pass@example.invalid', 'https://example.invalid/api', 'https://example.invalid?q=1'):
            r = self.run_script('--office-base', url, '--capture-office')
            self.assertNotEqual(r.returncode, 0)
        r = self.run_script('--target-base', 'http://127.0.0.1:1')
        self.assertNotEqual(r.returncode, 0)
        self.assertIn('expected-office-signature', r.stderr)

    def test_office_baseline_drift_blocks(self):
        with server() as (_, office), server('stale') as (_, changed):
            self.capture(office)
            r = self.run_script('--office-base', changed, '--target-base', office, '--expected-office-signature', self.baseline)
            self.assertNotEqual(r.returncode, 0)
            self.assertIn('office changed', r.stderr)

    def test_network_failure_is_not_success(self):
        with socket.socket() as s:
            s.bind(('127.0.0.1', 0))
            port = s.getsockname()[1]
        r = self.run_script('--office-base', f'http://127.0.0.1:{port}', '--capture-office', '--timeout', 1)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn('network/TLS failure', r.stderr)

class TemplateTests(unittest.TestCase):
    def test_tunnel_security_and_liveness(self):
        text = (ROOT / 'deploy/systemd/mih-tunnel.service').read_text()
        for expected in ('127.0.0.1:18080:127.0.0.1:8080', 'StrictHostKeyChecking=yes', 'ExitOnForwardFailure=yes',
                         'ServerAliveInterval=30', 'ServerAliveCountMax=3', 'Restart=always', '%%h %%p', '-F /dev/null', '-l mih-tunnel'):
            self.assertIn(expected, text)
        self.assertNotIn('StrictHostKeyChecking=no', text)
        self.assertNotIn('-i /home/hrmaulana/.ssh/vps_tunnel', text)

    def test_no_stale_fallback_streaming_both_listeners(self):
        text = NGINX_TEMPLATE.read_text()
        self.assertEqual(text.count('proxy_pass http://127.0.0.1:18080;'), 2)
        for forbidden in ('127.0.0.1:8080', '127.0.0.1:8081', 'backup;', 'proxy_cache_use_stale'):
            self.assertNotIn(forbidden, text)
        for directive in ('proxy_buffering off;', 'proxy_request_buffering off;', 'proxy_read_timeout 3600s;',
                          'proxy_cache off;', 'proxy_next_upstream off;', 'error_page 502 503 504 =503 @mih_maintenance;',
                          'return 503', 'Cache-Control "no-store"'):
            self.assertEqual(text.count(directive), 2)

class NginxFixtureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.binary = os.environ.get('MIH_TEST_NGINX') or shutil.which('nginx')
        if not cls.binary:
            raise unittest.SkipTest('set MIH_TEST_NGINX to a local fixture binary for real nginx syntax/runtime checks')

    def test_syntax_streaming_and_upstream_down_503(self):
        with tempfile.TemporaryDirectory(prefix='mih-nginx-fixture-') as tmp, server() as (upstream, _):
            tmp = Path(tmp)
            cert, key = tmp / 'cert.pem', tmp / 'key.pem'
            subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=fixture.invalid',
                            '-keyout', str(key), '-out', str(cert)], check=True, capture_output=True)
            with socket.socket() as s:
                s.bind(('127.0.0.1', 0))
                port = s.getsockname()[1]
            with socket.socket() as s:
                s.bind(('127.0.0.1', 0))
                tls_port = s.getsockname()[1]
            text = NGINX_TEMPLATE.read_text().replace('listen 80;', f'listen 127.0.0.1:{port};').replace('listen [::]:80;', '')
            text = text.replace('listen 443 ssl;', f'listen 127.0.0.1:{tls_port} ssl;').replace('listen [::]:443 ssl;', '')
            text = text.replace('/etc/letsencrypt/live/remote.keuanganppn1.cloud/fullchain.pem', str(cert))
            text = text.replace('/etc/letsencrypt/live/remote.keuanganppn1.cloud/privkey.pem', str(key))
            text = text.replace('http://127.0.0.1:18080', f'http://127.0.0.1:{upstream.server_port}')
            # Fixture-only port/cert substitution; production timeouts are unchanged.
            config = tmp / 'nginx.conf'
            config.write_text(f'pid {tmp}/nginx.pid; error_log {tmp}/error.log; events {{}} http {{ access_log off; client_body_temp_path {tmp}/body; proxy_temp_path {tmp}/proxy; fastcgi_temp_path {tmp}/fastcgi; uwsgi_temp_path {tmp}/uwsgi; scgi_temp_path {tmp}/scgi; {text} }}')
            cmd = [self.binary, '-p', str(tmp) + '/', '-c', str(config)]
            syntax = subprocess.run(cmd + ['-t'], capture_output=True, text=True)
            self.assertEqual(syntax.returncode, 0, syntax.stderr)
            process = subprocess.Popen(cmd + ['-g', 'daemon off;'], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            try:
                deadline = time.monotonic() + 5
                while True:
                    try:
                        with socket.create_connection(('127.0.0.1', port), timeout=.2):
                            break
                    except OSError:
                        if time.monotonic() >= deadline or process.poll() is not None:
                            self.fail('fixture nginx did not become ready')
                        time.sleep(.02)
                direct = urllib.request.build_opener(urllib.request.ProxyHandler({}))
                start = time.monotonic()
                with direct.open(f'http://127.0.0.1:{port}/fixture-stream', timeout=3) as r:
                    self.assertEqual(r.readline(), b'data: first\n')
                    self.assertLess(time.monotonic() - start, .6, 'SSE first event buffered until second event')
                    self.assertEqual(r.headers['X-Accel-Buffering'], 'no')
                    r.read()
                upstream.shutdown()
                upstream.server_close()
                for path in ('/', '/api/admin/documents', '/api/early-warning?limit=1'):
                    with self.assertRaises(urllib.error.HTTPError) as caught:
                        direct.open(f'http://127.0.0.1:{port}{path}', timeout=8)
                    self.assertEqual(caught.exception.code, 503)
                    self.assertEqual(caught.exception.headers['Cache-Control'], 'no-store')
                    self.assertIn(b'MIH kantor', caught.exception.read())
                    caught.exception.close()
            finally:
                process.terminate()
                process.communicate(timeout=5)

if __name__ == '__main__':
    unittest.main()
