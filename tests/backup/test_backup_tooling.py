"""Backup-only tests: temp filesystem/keys and fake external tools, never production."""
import datetime as dt
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / 'scripts'


class RetentionTests(unittest.TestCase):
    def test_calendar_buckets_union_and_default_dry_run(self):
        with tempfile.TemporaryDirectory() as tmp:
            entries = []
            now = dt.datetime(2026, 10, 13, tzinfo=dt.timezone.utc)
            for i in range(120):
                stamp = (now - dt.timedelta(days=i)).strftime('%Y%m%dT%H%M%SZ')
                name = f'mih-office-{stamp}-abcdef123456.gpg'
                entries.append({'Name': name, 'Size': 20})
                entries.append({'Name': name[:-4] + '.manifest.json', 'Size': 100})
            entries += [{'Name': 'recovery-private-key.asc', 'Size': 10},
                        {'Name': 'mih-office-junk.gpg', 'Size': 10},
                        {'Name': entries[0]['Name'] + '.partial', 'Size': 20}]
            inventory = Path(tmp) / 'inventory.json'
            inventory.write_text(json.dumps(entries))
            result = subprocess.run(['python3', str(SCRIPTS / 'backup-retention.py'),
                                     '--inventory', str(inventory)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            plan = json.loads(result.stdout)
            self.assertTrue(plan['dry_run'])
            self.assertGreater(len(plan['delete']), 0)
            self.assertIn(entries[0]['Name'], plan['keep'])
            self.assertNotIn('recovery-private-key.asc', plan['delete'])
            self.assertNotIn('mih-office-junk.gpg', plan['delete'])
            self.assertNotIn(entries[0]['Name'] + '.partial', plan['delete'])
            expected = set()
            for fmt, limit in [('%Y-%m-%d', 14), ('%G-%V', 4), ('%Y-%m', 3)]:
                buckets = set()
                for i in range(120):
                    bucket = (now - dt.timedelta(days=i)).strftime(fmt)
                    if bucket not in buckets and len(buckets) < limit:
                        buckets.add(bucket)
                        expected.add(entries[i * 2]['Name'])
            self.assertEqual(set(plan['keep']), expected)


class BackupFixture(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.keys_tmp = tempfile.TemporaryDirectory()
        cls.keys = Path(cls.keys_tmp.name)
        cls.keyhome = cls.keys / 'gpg'
        cls.keyhome.mkdir(mode=0o700)
        subprocess.run(['gpg', '--homedir', str(cls.keyhome), '--batch', '--pinentry-mode', 'loopback',
                        '--passphrase', '', '--quick-generate-key', 'MIH Fixture <fixture@example.invalid>',
                        'rsa2048', 'encr', '0'], check=True, capture_output=True)
        listing = subprocess.check_output(['gpg', '--homedir', str(cls.keyhome), '--with-colons', '--list-keys'], text=True)
        cls.fingerprint = next(line.split(':')[9] for line in listing.splitlines() if line.startswith('fpr:'))
        cls.public_key = cls.keys / 'recipient.asc'
        cls.public_key.write_bytes(subprocess.check_output(['gpg', '--homedir', str(cls.keyhome), '--armor', '--export', cls.fingerprint]))

    @classmethod
    def tearDownClass(cls):
        subprocess.run(['gpgconf', '--homedir', str(cls.keyhome), '--kill', 'gpg-agent'], capture_output=True)
        cls.keys_tmp.cleanup()

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        for name in ['bin', 'state', 'remote', 'appdata', 'source']:
            (self.base / name).mkdir()
        (self.base / 'appdata' / 'example.txt').write_text('fixture only')
        (self.base / 'source' / 'source.txt').write_text('no real documents')
        self.env = dict(os.environ, PATH=str(self.base / 'bin') + ':' + os.environ['PATH'],
                        FIXTURE=str(self.base), MIH_BACKUP_EXPECT_HOST=os.uname().nodename,
                        MIH_BACKUP_PUBLIC_KEY=str(self.public_key), MIH_BACKUP_FINGERPRINT=self.fingerprint,
                        MIH_BACKUP_STATE_DIR=str(self.base / 'state'), MIH_BACKUP_APPDATA=str(self.base / 'appdata'),
                        MIH_BACKUP_SOURCE=str(self.base / 'source'), MIH_BACKUP_MIN_FREE_BYTES='0',
                        MIH_BACKUP_REMOTE='fixture:Backup MIH', MIH_BACKUP_EXPECT_PGDATA=str(self.base / 'pgdata'))
        tool = '''#!/usr/bin/env python3
import json, os, pathlib, shutil, sys
base = pathlib.Path(os.environ['FIXTURE'])
args = sys.argv[1:]
name = pathlib.Path(sys.argv[0]).name
with (base / 'calls').open('a') as f: f.write(json.dumps([name] + args) + '\\n')
fail = os.environ.get('FAIL_STAGE', '')
if name == 'docker':
    if 'pg_dump' in args:
        sys.stdout.buffer.write(b'PGDMPfixture')
        sys.exit(9 if fail == 'dump' else 0)
    if 'pg_restore' in args:
        sys.stdin.buffer.read()
        if fail == 'dump_validation': sys.exit(8)
        NL = chr(10)
        sys.stdout.write(NL.join(['-- Dumped from database version 16.4', '-- Dumped by pg_dump version 16.4', 'COPY public.documents (id) FROM stdin;', '1', chr(92)+'.', 'COPY public.chunks (id) FROM stdin;', '1', chr(92)+'.', 'COPY public.articles (id) FROM stdin;', chr(92)+'.', 'COPY public.article_scores (id) FROM stdin;', chr(92)+'.']))
    elif 'pg_dumpall' in args: sys.stdout.write('-- fixture roles\\n')
    elif args[0] == 'inspect':
        pgdata = '/wrong' if fail == 'identity' else os.environ['MIH_BACKUP_EXPECT_PGDATA']
        sys.stdout.write(json.dumps([{'Name': '/' + args[1], 'State': {'Running': True},
                                     'Config': {'Image': 'pgvector/pgvector:pg16'},
                                     'Mounts': [{'Source': pgdata, 'Destination': '/var/lib/postgresql/data'}]}]))
    elif 'image' in args and 'inspect' in args: sys.stdout.write('[{}]')
    elif args[0] == 'run': sys.stdout.write('fixture-container-id')
    elif args[0] == 'rm':
        if fail == 'cleanup': sys.exit(9)
    elif 'pg_isready' in args: sys.exit(0)
    elif 'psql' in args:
        query = args[-1]
        if 'COPY (SELECT file_path' in query:
            import hashlib
            sys.stdout.write('/data/example.txt,' + hashlib.sha256(b'fixture only').hexdigest() + '\\n')
        else:
            sys.stdout.write(json.dumps({'row_counts': {'documents': 1, 'chunks': 1, 'articles': 0, 'article_scores': 0},
                                        'foreign_key_orphans': 0, 'invalid_constraints': 0, 'bad_vectors': 0,
                                        'vector_extension': '0.8.0', 'postgres': '16.4', 'sample_query_ok': True}))
    else: sys.exit(7)
elif name == 'rclone':
    remote = base / 'remote'
    def loc(x): return remote / x.split('/')[-1] if ':' in x else pathlib.Path(x)
    if args[0] == 'copyto':
        if fail == 'upload': sys.exit(6)
        shutil.copyfile(loc(args[1]), loc(args[2]))
    elif args[0] == 'moveto': shutil.move(loc(args[1]), loc(args[2]))
    elif args[0] == 'cat':
        data = loc(args[1]).read_bytes()
        sys.stdout.buffer.write(data + (b'bad' if fail == 'hash' and args[1].endswith('.gpg') else b''))
    elif args[0] == 'lsjson': sys.stdout.write(json.dumps([{'Name': p.name, 'Size': p.stat().st_size} for p in remote.iterdir()]))
    elif args[0] == 'deletefile': loc(args[1]).unlink()
    else: sys.exit(5)
'''
        for name in ['docker', 'rclone']:
            path = self.base / 'bin' / name
            path.write_text(tool)
            path.chmod(0o700)

    def invoke(self, script, *args):
        return subprocess.run(['bash', str(SCRIPTS / script), *args], env=self.env,
                              capture_output=True, text=True, timeout=60)

    def test_preflight_never_runs_dump_or_upload(self):
        result = self.invoke('backup-office.sh')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((self.base / 'calls').exists())

    def test_each_failed_stage_leaves_no_public_success_or_plaintext(self):
        for stage in ['dump', 'dump_validation', 'upload', 'hash']:
            with self.subTest(stage=stage):
                self.env['FAIL_STAGE'] = stage
                result = self.invoke('backup-office.sh', '--execute')
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn('fixture only', result.stdout + result.stderr)
                self.assertFalse(any(p.suffix == '.json' for p in (self.base / 'remote').iterdir()))
                self.assertFalse(any(p.name.startswith('.run-') for p in (self.base / 'state').iterdir()))

    def test_space_host_key_guards_stop_before_dump(self):
        for setting, value in [('MIH_BACKUP_MIN_FREE_BYTES', str(10 ** 30)),
                               ('MIH_BACKUP_EXPECT_HOST', 'not-the-office'),
                               ('MIH_BACKUP_PUBLIC_KEY', str(self.base / 'absent')),
                               ('MIH_BACKUP_FINGERPRINT', 'A' * 40)]:
            with self.subTest(setting=setting):
                previous = self.env[setting]
                self.env[setting] = value
                result = self.invoke('backup-office.sh', '--execute')
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse((self.base / 'calls').exists())
                self.env[setting] = previous

    def test_db_identity_must_match_expected_pgdata(self):
        self.env['FAIL_STAGE'] = 'identity'
        result = self.invoke('backup-office.sh', '--execute')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('db-identity', result.stderr)
        self.assertNotIn('pg_dump', (self.base / 'calls').read_text())

    def test_state_cannot_overlap_snapshot_sources(self):
        self.env['MIH_BACKUP_STATE_DIR'] = str(self.base / 'source' / 'state')
        result = self.invoke('backup-office.sh', '--execute')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('overlap', result.stderr)
        self.assertFalse((self.base / 'calls').exists())

    def test_lock_refuses_concurrent_backup(self):
        import fcntl
        with (self.base / 'state' / '.backup.lock').open('w') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            result = self.invoke('backup-office.sh', '--execute')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('already-running', result.stderr)
        self.assertFalse((self.base / 'calls').exists())

    def test_private_key_in_sources_is_rejected_before_upload(self):
        (self.base / 'source' / 'recovery-private-key.asc').write_text('-----BEGIN PGP PRIVATE KEY BLOCK-----\nfixture')
        result = self.invoke('backup-office.sh', '--execute')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(any((self.base / 'remote').iterdir()))

    def test_verify_rejects_corrupt_remote_bytes(self):
        self.assertEqual(self.invoke('backup-office.sh', '--execute').returncode, 0)
        manifest = next((self.base / 'remote').glob('*.json'))
        archive = next((self.base / 'remote').glob('*.gpg'))
        archive.write_bytes(b'corrupt')
        result = self.invoke('verify-backup.sh', '--manifest', str(manifest),
                             '--remote-object', 'fixture:Backup MIH/' + archive.name)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('remote-checksum-mismatch', result.stderr)

    def test_retention_apply_requires_confirmed_key_and_fresh_verified_copy(self):
        result = subprocess.run(['python3', str(SCRIPTS / 'backup-retention.py'), '--apply',
                                 '--remote', 'fixture:Backup MIH'], env=self.env, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('recovery-key', result.stderr)
        self.assertFalse((self.base / 'calls').exists())

    def test_retention_apply_rechecks_latest_bytes_before_delete(self):
        self.assertEqual(self.invoke('backup-office.sh', '--execute').returncode, 0)
        # More than 14 days / 4 weeks / 3 months: these old pairs become candidates.
        for year in [2024, 2025, 2026]:
            for month in range(1, 10):
                name = f'mih-office-{year}{month:02d}01T000000Z-abcdef123456'
                (self.base / 'remote' / (name + '.gpg')).write_bytes(b'old')
                (self.base / 'remote' / (name + '.manifest.json')).write_text('{}')
        latest = sorted((self.base / 'remote').glob('*.gpg'))[-1]
        latest.write_bytes(b'corrupt latest')
        result = subprocess.run(['python3', str(SCRIPTS / 'backup-retention.py'), '--apply',
                                 '--recovery-key-confirmed', '--remote', 'fixture:Backup MIH'],
                                env=self.env, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('remote-checksum-mismatch', result.stderr)
        self.assertNotIn('deletefile', (self.base / 'calls').read_text())

    def drill_arguments(self):
        manifest = next((self.base / 'remote').glob('*.json'))
        archive = next((self.base / 'remote').glob('*.gpg'))
        scratch = self.base / 'drill-scratch'
        scratch.mkdir(mode=0o700)
        return ['--execute', '--ack-isolated', '--manifest', str(manifest),
                '--remote-object', 'fixture:Backup MIH/' + archive.name,
                '--gnupg-home', str(self.keyhome), '--image', 'pgvector/pgvector:pg16',
                '--work-root', str(scratch), '--report', str(self.base / 'drill-report.json')]

    def test_restore_fixture_checks_data_and_cleans_exact_isolated_container(self):
        bres = self.invoke('backup-office.sh', '--execute')
        self.assertEqual(bres.returncode, 0)
        args = self.drill_arguments()
        (self.base / 'calls').write_text('')
        result = self.invoke('restore-drill.sh', *args)
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads((self.base / 'drill-report.json').read_text())
        self.assertTrue(report['restore_drill_verified'])
        self.assertTrue(report['cleanup_verified'])
        self.assertEqual(report['documents_files_verified'], 1)
        calls = [json.loads(line) for line in (self.base / 'calls').read_text().splitlines()]
        run = next(call for call in calls if call[:2] == ['docker', 'run'])
        self.assertEqual(run[run.index('--network') + 1], 'none')
        self.assertEqual(run[run.index('--pull') + 1], 'never')
        self.assertNotIn('-p', run)
        self.assertNotIn('--publish', run)
        self.assertNotIn('-v', run)
        name = run[run.index('--name') + 1]
        self.assertTrue(name.startswith('mih-restore-drill-'))
        self.assertIn(['docker', 'rm', '-f', name], calls)
        self.assertNotIn('mih-db-1', (self.base / 'calls').read_text())
        self.assertFalse(any((self.base / 'drill-scratch').iterdir()))
        self.assertNotIn('example.txt', result.stdout + result.stderr)

    def test_restore_failure_cleans_isolated_resource_and_has_no_success_report(self):
        self.assertEqual(self.invoke('backup-office.sh', '--execute').returncode, 0)
        args = self.drill_arguments()
        (self.base / 'calls').write_text('')
        self.env['FAIL_STAGE'] = 'dump_validation'
        result = self.invoke('restore-drill.sh', *args)
        self.assertNotEqual(result.returncode, 0)
        calls = (self.base / 'calls').read_text()
        self.assertIn('"rm", "-f", "mih-restore-drill-', calls)
        self.assertFalse((self.base / 'drill-report.json').exists())
        self.assertFalse(any((self.base / 'drill-scratch').iterdir()))

    def test_restore_default_is_plan_only(self):
        result = self.invoke('restore-drill.sh')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((self.base / 'calls').exists())
        self.assertIn('plan-only', result.stdout)

    def test_restore_execute_requires_explicit_isolation_ack(self):
        result = self.invoke('restore-drill.sh', '--execute')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('ack-isolated', result.stderr)
        self.assertFalse((self.base / 'calls').exists())

    def test_archive_traversal_links_and_hash_mismatch_are_rejected(self):
        import io
        import tarfile
        import sys
        sys.path.insert(0, str(SCRIPTS))
        self.addCleanup(lambda: sys.path.remove(str(SCRIPTS)))
        from backup_support import safe_extract, BackupError
        for member_name, is_link in [('../escape', False), ('/absolute', False), ('database.dump', True)]:
            with self.subTest(member=member_name):
                archive = self.base / 'malicious.tar'
                with tarfile.open(archive, 'w') as tar:
                    info = tarfile.TarInfo(member_name)
                    if is_link:
                        info.type = tarfile.SYMTYPE
                        info.linkname = '/etc/passwd'
                        tar.addfile(info)
                    else:
                        info.size = 3
                        tar.addfile(info, io.BytesIO(b'bad'))
                with self.assertRaises(BackupError):
                    safe_extract(archive, self.base / 'extract')
        archive = self.base / 'bad-hash.tar'
        data = {'database.dump': b'bad', 'checksums.json': json.dumps({'database.dump': {'size_bytes': 3, 'sha256': '0' * 64}}).encode()}
        with tarfile.open(archive, 'w') as tar:
            for name, value in data.items():
                info = tarfile.TarInfo(name)
                info.size = len(value)
                tar.addfile(info, io.BytesIO(value))
        with self.assertRaises(BackupError):
            safe_extract(archive, self.base / 'extract-hash')

    def test_backup_encrypts_only_public_key_and_verifies_offsite(self):
        result = self.invoke('backup-office.sh', '--execute')
        self.assertEqual(result.returncode, 0, result.stderr)
        files = sorted((self.base / 'remote').iterdir())
        self.assertEqual({p.suffix for p in files}, {'.gpg', '.json'})
        manifest = json.loads(next(p for p in files if p.suffix == '.json').read_text())
        self.assertTrue(manifest['offsite_verified'])
        self.assertNotIn('example.txt', json.dumps(manifest))
        self.assertEqual(manifest['fingerprint'], self.fingerprint)
        archive = next(p for p in files if p.suffix == '.gpg')
        output = self.base / 'decrypted.tar'
        subprocess.run(['gpg', '--homedir', str(self.keyhome), '--batch', '--output', str(output),
                        '--decrypt', str(archive)], check=True, capture_output=True)
        import tarfile
        with tarfile.open(output) as tar:
            names = tar.getnames()
            self.assertIn('database.dump', names)
            self.assertIn('files/appdata/example.txt', names)
            self.assertIn('files/source/source.txt', names)
            snapshot = json.load(tar.extractfile('snapshot.json'))
            self.assertEqual(snapshot['versions']['postgres'], '16.4')
            self.assertFalse(any('private' in name or 'gnupg' in name for name in names))
        self.assertFalse(any(p.name.startswith('.run-') for p in (self.base / 'state').iterdir()))
        self.assertEqual(archive.stat().st_mode & 0o777, 0o600)
        verified = self.invoke('verify-backup.sh', '--manifest', str(next(p for p in files if p.suffix == '.json')),
                               '--remote-object', 'fixture:Backup MIH/' + archive.name)
        self.assertEqual(verified.returncode, 0, verified.stderr)


if __name__ == '__main__':
    unittest.main()
