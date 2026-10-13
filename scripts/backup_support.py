#!/usr/bin/env python3
"""MIH encrypted backup entrypoints; stdlib only, no provider/network beyond rclone.

Command diagnostics are deliberately suppressed: dump/GPG/rclone output can
contain confidential filenames or credentials. Public logs contain stage only.
"""
import argparse
import contextlib
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import tarfile
import tempfile
import uuid
from typing import Any, IO

DEFAULT_FINGERPRINT = '0B6FCC365C27CC2249977BD2979F5FBAC2DB08D8'
SNAPSHOT = re.compile(r'^mih-office-(\d{8}T\d{6}Z)-[0-9a-f]{12}\.gpg$')
TABLES = ('documents', 'chunks', 'articles', 'article_scores')


class BackupError(Exception):
    pass


def command(args, *, stdin=None, stdout: int | IO[Any] | None = subprocess.PIPE):
    try:
        result = subprocess.run(args, stdin=stdin, stdout=stdout, stderr=subprocess.DEVNULL,
                                timeout=int(os.environ.get('MIH_BACKUP_TIMEOUT_SECONDS', '21600')),
                                check=True)
        return result.stdout
    except (OSError, subprocess.SubprocessError) as exc:
        raise BackupError('external-command-failed') from exc


def digest(path):
    with Path(path).open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def write_json(path, value):
    Path(path).write_text(json.dumps(value, sort_keys=True) + '\n')
    Path(path).chmod(0o600)


def remote_folder(remote):
    if ':' not in remote or remote.split(':', 1)[1].strip('/') != 'Backup MIH':
        raise BackupError('remote-must-be-dedicated-Backup-MIH-folder')
    return remote.rstrip('/')


def validate_manifest(manifest, object_name):
    if not SNAPSHOT.fullmatch(object_name):
        raise BackupError('invalid-snapshot-name')
    if (manifest.get('schema') != 1 or manifest.get('archive') != object_name
            or not re.fullmatch(r'[0-9a-f]{64}', manifest.get('sha256', ''))
            or not isinstance(manifest.get('size_bytes'), int) or manifest['size_bytes'] <= 0
            or not re.fullmatch(r'[0-9A-F]{40}', manifest.get('fingerprint', ''))):
        raise BackupError('invalid-public-manifest')


def verify_remote(manifest, remote_object, workdir):
    name = remote_object.rsplit('/', 1)[-1]
    remote_folder(remote_object.rsplit('/', 1)[0])
    validate_manifest(manifest, name)
    downloaded = Path(workdir) / ('verify-' + uuid.uuid4().hex + '.gpg')
    try:
        # Stream bytes instead of relying on provider-specific (often unavailable) hashes.
        with downloaded.open('xb') as handle:
            command(['rclone', 'cat', remote_object], stdout=handle)
        if downloaded.stat().st_size != manifest['size_bytes'] or digest(downloaded) != manifest['sha256']:
            raise BackupError('remote-checksum-mismatch')
    finally:
        downloaded.unlink(missing_ok=True)


def dump_metadata(container, dump):
    # pg_restore expands ALL data, not just --list (which misses truncated blocks).
    # Stream to an unnamed spool file; no SQL names/content enter public logs.
    counts = {}
    versions = {}
    with dump.open('rb') as handle, tempfile.TemporaryFile(dir=dump.parent) as sql:
        command(['docker', 'exec', '-i', container, 'pg_restore', '--file=-'], stdin=handle, stdout=sql)
        sql.seek(0)
        table = None
        for raw in sql:
            line = raw.decode('utf-8', errors='replace').rstrip('\r\n')
            match = re.match(r'^COPY public\.(\w+) \(', line)
            if match:
                table = match[1] if match[1] in TABLES else None
                if table:
                    counts[table] = 0
            elif line == '\\.':
                table = None
            elif table:
                counts[table] += 1
            elif line.startswith('-- Dumped from database version '):
                versions['postgres'] = line.removeprefix('-- Dumped from database version ')
            elif line.startswith('-- Dumped by pg_dump version '):
                versions['pg_dump'] = line.removeprefix('-- Dumped by pg_dump version ')
    if set(counts) != set(TABLES):
        raise BackupError('required-tables-missing-from-dump')
    return {'row_counts': counts, 'versions': versions, 'vector_dimensions': 1536,
            'consistency': 'DB dump consistent; file copies sequential, NOT atomic with DB'}


def public_key_home(key, fingerprint, home):
    home.mkdir(mode=0o700)
    # Never import the operational keyring: it may include private material.
    info = command(['gpg', '--homedir', str(home), '--batch', '--with-colons',
                    '--import-options', 'show-only', '--import', str(key)]).decode()
    records = [line.split(':') for line in info.splitlines()]
    if any(row[0] in ('sec', 'ssb') for row in records):
        raise BackupError('public-key-file-contains-secret-key')
    primary = [records[i + 1][9] for i, row in enumerate(records[:-1])
               if row[0] == 'pub' and records[i + 1][0] == 'fpr']
    if primary != [fingerprint]:
        raise BackupError('public-key-fingerprint-mismatch')
    command(['gpg', '--homedir', str(home), '--batch', '--import', str(key)])


def add_file(tar, source, name, files):
    # Only regular files; no symlink traversal or keyring directories in snapshot.
    if source.is_symlink() or not source.is_file():
        raise BackupError('non-regular-snapshot-file')
    before = source.stat()
    if any(part in ('.gnupg', 'gnupg', 'private-keys-v1.d') for part in source.parts) or source.name == 'recovery-private-key.asc':
        raise BackupError('private-key-material-in-snapshot-source')
    with source.open('rb') as handle:
        if b'-----BEGIN PGP PRIVATE KEY BLOCK-----' in handle.read(8192):
            raise BackupError('private-key-material-in-snapshot-source')
        handle.seek(0)
        checksum = hashlib.file_digest(handle, 'sha256').hexdigest()
        handle.seek(0)
        info = tar.gettarinfo(str(source), arcname=name)
        info.uid = info.gid = 0
        info.uname = info.gname = ''
        info.mode = 0o600
        tar.addfile(info, handle)
    after = source.stat()
    if (before.st_size, before.st_mtime_ns, before.st_ino) != (after.st_size, after.st_mtime_ns, after.st_ino):
        raise BackupError('file-changed-during-snapshot')
    files[name] = {'size_bytes': before.st_size, 'sha256': checksum}


def backup(execute):
    env = os.environ
    host = env.get('MIH_BACKUP_EXPECT_HOST', 'keuanganpmp')
    if socket.gethostname() != host:
        raise BackupError('office-host-identity-mismatch')
    key = Path(env.get('MIH_BACKUP_PUBLIC_KEY', str(Path.home() / '.config/mih-backup/recipient-public-key.asc')))
    if not key.is_file():
        raise BackupError('public-key-missing')
    remote = remote_folder(env.get('MIH_BACKUP_REMOTE', 'onedrive:Backup MIH'))
    appdata = Path(env.get('MIH_BACKUP_APPDATA', '/var/lib/docker/volumes/mih_appdata/_data')).resolve()
    source = Path(env.get('MIH_BACKUP_SOURCE', '/data/mih/rclone')).resolve()
    if not appdata.is_dir() or not source.is_dir():
        raise BackupError('snapshot-source-missing')
    if not execute:
        print(json.dumps({'status': 'preflight-only', 'backup_executed': False}))
        return
    state = Path(env.get('MIH_BACKUP_STATE_DIR', '/var/backups/mih-encrypted'))
    if state.is_symlink() or any(state.resolve().is_relative_to(root) or root.is_relative_to(state.resolve())
                                 for root in (appdata, source)):
        raise BackupError('backup-state-source-overlap')
    state.mkdir(parents=True, exist_ok=True, mode=0o700)
    state.chmod(0o700)
    with (state / '.backup.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise BackupError('backup-already-running') from exc
        minimum = int(env.get('MIH_BACKUP_MIN_FREE_BYTES', str(10 * 1024 ** 3)))
        if shutil.disk_usage(state).free < minimum:
            raise BackupError('insufficient-free-space')
        run_id = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:12]
        name = 'mih-office-' + run_id + '.gpg'
        fingerprint = env.get('MIH_BACKUP_FINGERPRINT', DEFAULT_FINGERPRINT).upper()
        container = env.get('MIH_BACKUP_DB_CONTAINER', 'mih-db-1')
        user = env.get('MIH_BACKUP_DB_USER', 'mih')
        database = env.get('MIH_BACKUP_DB_NAME', 'mih')
        stage = 'key'
        # Clean only this run's private temporary directory, including on failure.
        with tempfile.TemporaryDirectory(prefix='.run-', dir=state) as tmp:
            work = Path(tmp)
            try:
                public_key_home(key, fingerprint, work / 'public-gnupg')
                stage = 'db-identity'
                identity = json.loads(command(['docker', 'inspect', container]))
                expected_pgdata = str(Path(env.get('MIH_BACKUP_EXPECT_PGDATA', '/data/mih/pgdata')).resolve())
                if (len(identity) != 1 or identity[0].get('Name') != '/' + container
                        or identity[0].get('State', {}).get('Running') is not True
                        or not identity[0].get('Config', {}).get('Image', '').startswith('pgvector/pgvector:')
                        or not any(mount.get('Source') == expected_pgdata and mount.get('Destination') == '/var/lib/postgresql/data'
                                   for mount in identity[0].get('Mounts', []))):
                    raise BackupError('db-identity-mismatch')
                stage = 'dump'
                partial = work / 'database.dump.partial'
                with partial.open('xb') as out:
                    command(['docker', 'exec', container, 'pg_dump', '-U', user, '-d', database, '-Fc'], stdout=out)
                if partial.stat().st_size == 0:
                    raise BackupError('empty-dump')
                stage = 'dump-validation'
                metadata = dump_metadata(container, partial)
                partial.rename(work / 'database.dump')
                roles = work / 'roles.sql'
                with roles.open('xb') as out:
                    command(['docker', 'exec', container, 'pg_dumpall', '-U', user,
                             '--globals-only', '--no-role-passwords'], stdout=out)
                metadata['source_roots'] = {'appdata': str(appdata), 'source': str(source)}
                write_json(work / 'snapshot.json', metadata)
                stage = 'archive'
                checksums = {}
                archive = work / 'snapshot.tar'
                with tarfile.open(archive, 'w') as tar:
                    for item in ('database.dump', 'roles.sql', 'snapshot.json'):
                        add_file(tar, work / item, item, checksums)
                    for label, root in [('appdata', appdata), ('source', source)]:
                        for path in sorted(root.rglob('*')):
                            if path.is_file() or path.is_symlink():
                                add_file(tar, path, 'files/' + label + '/' + path.relative_to(root).as_posix(), checksums)
                    config = env.get('MIH_BACKUP_RCLONE_CONFIG')
                    if config:
                        add_file(tar, Path(config), 'config/rclone.conf', checksums)
                    write_json(work / 'checksums.json', checksums)
                    tar.add(work / 'checksums.json', arcname='checksums.json', recursive=False)
                stage = 'encrypt'
                encrypted = work / name
                command(['gpg', '--homedir', str(work / 'public-gnupg'), '--batch', '--yes',
                         '--trust-model', 'always', '--recipient', fingerprint, '--output', str(encrypted),
                         '--encrypt', str(archive)])
                manifest = {'schema': 1, 'archive': name, 'run_id': run_id,
                            'created_at': dt.datetime.now(dt.timezone.utc).isoformat(),
                            'fingerprint': fingerprint, 'size_bytes': encrypted.stat().st_size,
                            'sha256': digest(encrypted), 'dump_verified': True,
                            'offsite_verified': False, 'restore_drill_verified': False}
                target = remote + '/' + name
                stage = 'upload'
                command(['rclone', 'copyto', str(encrypted), target + '.partial'])
                # Verify temporary remote object before promotion (same bytes).
                temporary_manifest = dict(manifest)
                with (work / 'remote-partial.gpg').open('xb') as out:
                    command(['rclone', 'cat', target + '.partial'], stdout=out)
                if digest(work / 'remote-partial.gpg') != manifest['sha256']:
                    raise BackupError('remote-checksum-mismatch')
                command(['rclone', 'moveto', target + '.partial', target])
                stage = 'remote-verification'
                verify_remote(manifest, target, work)
                manifest['offsite_verified'] = True
                public = work / name.replace('.gpg', '.manifest.json')
                write_json(public, manifest)
                remote_manifest = remote + '/' + public.name
                command(['rclone', 'copyto', str(public), remote_manifest + '.partial'])
                command(['rclone', 'moveto', remote_manifest + '.partial', remote_manifest])
                if command(['rclone', 'cat', remote_manifest]) != public.read_bytes():
                    raise BackupError('remote-manifest-mismatch')
                stage = 'local-finalize'
                shutil.copyfile(encrypted, state / name)
                (state / name).chmod(0o600)
                shutil.copyfile(public, state / public.name)
                (state / public.name).chmod(0o600)
                print(json.dumps({'run_id': run_id, 'status': 'ok', 'stage': 'offsite-verified',
                                  'size_bytes': manifest['size_bytes'], 'sha256': manifest['sha256']}))
            except BackupError as exc:
                raise BackupError(stage + ':' + str(exc)) from exc


def verify(args):
    manifest = json.loads(args.manifest.read_text())
    with tempfile.TemporaryDirectory(prefix='mih-verify-') as tmp:
        verify_remote(manifest, args.remote_object, tmp)
    print(json.dumps({'status': 'ok', 'offsite_bytes_verified': True, 'decrypt_verified': False}))


def safe_extract(archive, destination):
    destination = Path(destination)
    destination.mkdir(mode=0o700, parents=True, exist_ok=True)
    names = set()
    total = 0
    with tarfile.open(archive, 'r:') as tar:
        for member in tar:
            name = member.name
            path = Path(name)
            allowed = name in ('database.dump', 'roles.sql', 'snapshot.json', 'checksums.json', 'config/rclone.conf') or name.startswith(('files/appdata/', 'files/source/'))
            if (not allowed or path.is_absolute() or '..' in path.parts or not member.isfile()
                    or name in names or '\\' in name or str(path) != name):
                raise BackupError('unsafe-archive-member')
            total += member.size
            if total > int(os.environ.get('MIH_DRILL_MAX_PLAINTEXT_BYTES', str(100 * 1024 ** 3))):
                raise BackupError('archive-exceeds-size-limit')
            names.add(name)
            target = destination / path
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            if target.exists() or target.is_symlink():
                raise BackupError('archive-target-already-exists')
            stream = tar.extractfile(member)
            if stream is None:
                raise BackupError('unreadable-archive-member')
            with stream, target.open('xb') as out:
                shutil.copyfileobj(stream, out)
            target.chmod(0o600)
    required = {'database.dump', 'roles.sql', 'snapshot.json', 'checksums.json'}
    if not required.issubset(names):
        raise BackupError('missing-snapshot-members')
    checksums = json.loads((destination / 'checksums.json').read_text())
    if set(checksums) != names - {'checksums.json'}:
        raise BackupError('snapshot-manifest-file-set-mismatch')
    for name, expected in checksums.items():
        target = destination / name
        if target.stat().st_size != expected['size_bytes'] or digest(target) != expected['sha256']:
            raise BackupError('snapshot-file-checksum-mismatch')
    return json.loads((destination / 'snapshot.json').read_text())


def restore_drill(args):
    if not args.execute:
        print(json.dumps({'status': 'plan-only', 'restore_executed': False,
                          'isolation': 'unique container, no host mounts, no network or published ports'}))
        return
    if not args.ack_isolated:
        raise BackupError('--execute-requires--ack-isolated')
    if not all((args.manifest, args.remote_object, args.gnupg_home, args.image, args.work_root, args.report)):
        raise BackupError('restore-inputs-required')
    if not re.fullmatch(r'pgvector/pgvector:[A-Za-z0-9_.-]+(?:@sha256:[0-9a-f]{64})?', args.image):
        raise BackupError('explicit-pgvector-image-required')
    home = args.gnupg_home.resolve()
    if not home.is_dir() or home.stat().st_mode & 0o077:
        raise BackupError('recovery-keyring-must-be-private')
    scratch = args.work_root.resolve()
    protected = [Path('/data/mih'), Path('/var/lib/docker'),
                 Path(os.environ.get('MIH_BACKUP_APPDATA', '/var/lib/docker/volumes/mih_appdata/_data')),
                 Path(os.environ.get('MIH_BACKUP_SOURCE', '/data/mih/rclone')), home]
    if any(scratch == path.resolve() or scratch.is_relative_to(path.resolve())
           or path.resolve().is_relative_to(scratch) for path in protected):
        raise BackupError('scratch-overlaps-protected-path')
    if not scratch.is_dir() or scratch.stat().st_mode & 0o077 or args.work_root.is_symlink():
        raise BackupError('scratch-must-be-existing-private-directory')
    if args.report.exists() or args.report.is_relative_to(scratch):
        raise BackupError('report-must-be-new-and-outside-scratch')
    manifest = json.loads(args.manifest.read_text())
    object_name = args.remote_object.rsplit('/', 1)[-1]
    remote_folder(args.remote_object.rsplit('/', 1)[0])
    validate_manifest(manifest, object_name)
    if shutil.disk_usage(scratch).free < manifest['size_bytes'] * 3:
        raise BackupError('insufficient-drill-free-space')
    container = 'mih-restore-drill-' + uuid.uuid4().hex
    started = False
    report = None
    with tempfile.TemporaryDirectory(prefix='run-', dir=scratch) as tmp:
        work = Path(tmp)
        encrypted = work / object_name
        with encrypted.open('xb') as out:
            command(['rclone', 'cat', args.remote_object], stdout=out)
        if encrypted.stat().st_size != manifest['size_bytes'] or digest(encrypted) != manifest['sha256']:
            raise BackupError('remote-checksum-mismatch')
        archive = work / 'snapshot.tar'
        command(['gpg', '--homedir', str(home), '--batch', '--output', str(archive), '--decrypt', str(encrypted)])
        extracted = work / 'extracted'
        metadata = safe_extract(archive, extracted)
        command(['docker', 'image', 'inspect', args.image])
        try:
            command(['docker', 'run', '-d', '--pull', 'never', '--name', container,
                     '--label', 'mih.restore-drill=' + container, '--network', 'none',
                     '--memory', '2g', '--cpus', '1', '--security-opt', 'no-new-privileges',
                     '--tmpfs', '/var/lib/postgresql/data:rw,nosuid,size=1073741824',
                     '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', '--env', 'POSTGRES_USER=mih_drill',
                     '--env', 'POSTGRES_DB=mih_drill', args.image])
            started = True
            import time
            ready = False
            for _ in range(60):
                try:
                    command(['docker', 'exec', container, 'pg_isready', '-U', 'mih_drill', '-d', 'mih_drill'])
                    ready = True
                    break
                except BackupError:
                    time.sleep(1)
            if not ready:
                raise BackupError('isolated-db-not-ready')
            with (extracted / 'database.dump').open('rb') as dump:
                command(['docker', 'exec', '-i', container, 'pg_restore', '--exit-on-error',
                         '--no-owner', '--no-privileges', '-U', 'mih_drill', '-d', 'mih_drill'], stdin=dump)
            dimensions = metadata['vector_dimensions']
            if not isinstance(dimensions, int) or not 1 <= dimensions <= 16000:
                raise BackupError('invalid-vector-dimensions')
            sql = """SELECT json_build_object(
                'row_counts', json_build_object('documents', (SELECT count(*) FROM documents),
                  'chunks', (SELECT count(*) FROM chunks), 'articles', (SELECT count(*) FROM articles),
                  'article_scores', (SELECT count(*) FROM article_scores)),
                'foreign_key_orphans', (SELECT count(*) FROM chunks c LEFT JOIN documents d ON d.id=c.document_id WHERE d.id IS NULL)
                  + (SELECT count(*) FROM article_scores s LEFT JOIN articles a ON a.id=s.article_id WHERE a.id IS NULL),
                'invalid_constraints', (SELECT count(*) FROM pg_constraint WHERE contype='f' AND NOT convalidated),
                'bad_vectors', (SELECT count(*) FROM chunks WHERE embedding IS NOT NULL AND vector_dims(embedding) <> DIMENSIONS),
                'vector_extension', (SELECT extversion FROM pg_extension WHERE extname='vector'),
                'postgres', current_setting('server_version'),
                'sample_query_ok', (SELECT count(*)=0 FROM chunks) OR EXISTS (
                  SELECT c.id FROM chunks c JOIN documents d ON c.document_id=d.id WHERE c.embedding IS NOT NULL
                  ORDER BY c.embedding <-> (SELECT embedding FROM chunks WHERE embedding IS NOT NULL LIMIT 1) LIMIT 1)
            );""".replace('DIMENSIONS', str(dimensions))
            psql = ['docker', 'exec', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'mih_drill', '-d', 'mih_drill', '-At', '-c']
            checks = json.loads(command(psql + [sql]))
            if checks['row_counts'] != metadata['row_counts']:
                raise BackupError('restored-row-count-mismatch')
            if any(checks[key] != 0 for key in ('foreign_key_orphans', 'invalid_constraints', 'bad_vectors')):
                raise BackupError('restored-integrity-check-failed')
            if not checks['vector_extension'] or checks['sample_query_ok'] is not True:
                raise BackupError('representative-vector-query-failed')
            versions = metadata.get('versions', {})
            if versions.get('postgres') and versions['postgres'].split('.')[0] != checks['postgres'].split('.')[0]:
                raise BackupError('postgres-major-version-mismatch')
            if versions.get('vector') and versions['vector'] != checks['vector_extension']:
                raise BackupError('vector-extension-version-mismatch')
            import csv
            import io
            documents = command(psql + ['COPY (SELECT file_path, sha256 FROM documents ORDER BY id) TO STDOUT WITH CSV']).decode()
            verified_files = 0
            for row in csv.reader(io.StringIO(documents)):
                if len(row) != 2:
                    raise BackupError('invalid-document-file-reference')
                path, expected_hash = row
                mappings = [('/data/raw/sharepoint', 'source'), ('/data/rclone', 'source'),
                            (metadata['source_roots']['source'], 'source'),
                            (metadata['source_roots']['appdata'], 'appdata'), ('/data', 'appdata')]
                candidate = None
                for prefix, label in mappings:
                    if path.startswith(prefix.rstrip('/') + '/'):
                        relative = Path(path[len(prefix.rstrip('/')) + 1:])
                        if relative.is_absolute() or '..' in relative.parts:
                            raise BackupError('unsafe-document-file-reference')
                        candidate = extracted / 'files' / label / relative
                        break
                if candidate is None or not candidate.is_file() or digest(candidate) != expected_hash:
                    raise BackupError('document-file-reconciliation-failed')
                verified_files += 1
            if verified_files != checks['row_counts']['documents']:
                raise BackupError('document-file-count-mismatch')
            report = {'schema': 1, 'archive': object_name, 'sha256': manifest['sha256'],
                      'checked_at': dt.datetime.now(dt.timezone.utc).isoformat(),
                      'restore_drill_verified': True, 'documents_files_verified': verified_files,
                      'row_counts': checks['row_counts'], 'cleanup_verified': False}
        finally:
            if started:
                # Exact freshly generated resource name, never a glob/compose teardown.
                command(['docker', 'rm', '-f', container])
    if report is None:
        raise BackupError('drill-incomplete')
    report['cleanup_verified'] = True
    write_json(args.report, report)
    print(json.dumps(report, sort_keys=True))


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    subs = parser.add_subparsers(dest='action', required=True)
    backup_parser = subs.add_parser('backup', help='Default preflight only; --execute performs backup/upload')
    backup_parser.add_argument('--execute', action='store_true')
    verify_parser = subs.add_parser('verify', help='Read remote encrypted bytes; never accesses private keys')
    verify_parser.add_argument('--manifest', type=Path, required=True)
    verify_parser.add_argument('--remote-object', required=True)
    drill = subs.add_parser('drill', help='Default plan-only; isolated restore needs explicit acknowledgment')
    drill.add_argument('--execute', action='store_true')
    drill.add_argument('--ack-isolated', action='store_true')
    drill.add_argument('--manifest', type=Path)
    drill.add_argument('--remote-object')
    drill.add_argument('--gnupg-home', type=Path, help='Private recovery keyring, local only')
    drill.add_argument('--image', help='Preinstalled pgvector image; never pulled automatically')
    drill.add_argument('--work-root', type=Path, help='Dedicated private scratch directory')
    drill.add_argument('--report', type=Path, help='Local nonsecret drill result, not backup manifest')
    args = parser.parse_args()
    try:
        if args.action == 'backup':
            backup(args.execute)
        elif args.action == 'verify':
            verify(args)
        else:
            restore_drill(args)
    except (BackupError, OSError, ValueError, KeyError, tarfile.TarError) as exc:
        # Do not expose exception values from filesystem/JSON/subprocess failures.
        reason = str(exc) if isinstance(exc, BackupError) else 'invalid-input-or-filesystem-error'
        print(json.dumps({'status': 'failed', 'reason': reason}), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
