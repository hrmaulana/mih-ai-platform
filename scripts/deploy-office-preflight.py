#!/usr/bin/env python3
"""Fail-closed, read-only office deployment checks. Never emit compose secrets."""
import argparse
import hashlib
import re
import json
import pathlib
import subprocess
import sys

REPO = pathlib.Path('/home/hrmaulana/mih')
PROJECT = 'mih'
APPDATA = 'mih_appdata'
APPDATA_PATH = '/var/lib/docker/volumes/mih_appdata/_data'
PGDATA = '/data/mih/pgdata'
COMPOSE = ['docker', 'compose', '-p', PROJECT, '--env-file', str(REPO / '.env.prod'),
           '-f', str(REPO / 'docker-compose.prod.yml'),
           # Use the tested runner checkout's identity override even for the first
           # release, when the old deployment checkout does not contain it yet.
           '-f', str(pathlib.Path(__file__).resolve().parents[1] / 'docker-compose.office.yml')]


def require(condition, message):
    if not condition:
        raise ValueError(message)


def validate_storage(config, containers, volumes):
    require(config.get('name') == PROJECT, 'compose project mismatch')
    appdata = config.get('volumes', {}).get('appdata', {})
    require(appdata.get('name') == APPDATA and appdata.get('external') is True,
            'appdata must be the existing external mih_appdata volume')
    require(len(volumes) == 1 and volumes[0].get('Name') == APPDATA
            and volumes[0].get('Mountpoint') == APPDATA_PATH, 'existing appdata volume mismatch')
    for service in ('db', 'backend', 'worker'):
        matches = [c for c in containers if c.get('Name') == f'/mih-{service}-1']
        require(len(matches) == 1, f'{service}: live container missing or ambiguous')
        live = matches[0]
        labels = live.get('Config', {}).get('Labels', {})
        require(labels.get('com.docker.compose.project') == PROJECT
                and labels.get('com.docker.compose.service') == service
                and labels.get('com.docker.compose.project.working_dir') == str(REPO),
                f'{service}: live project/service/repo mismatch')
        files = labels.get('com.docker.compose.project.config_files', '').split(',')
        require(files in [[str(REPO / 'docker-compose.prod.yml')],
                          [str(REPO / 'docker-compose.prod.yml'), str(REPO / 'docker-compose.office.yml')]],
                f'{service}: unexpected live compose files')
        require(live.get('State', {}).get('Running') is True, f'{service}: container not running')
        planned = config.get('services', {}).get(service, {}).get('volumes', [])
        expected = []
        for mount in planned:
            kind = mount.get('type')
            source = mount.get('source')
            if kind == 'volume':
                source = config.get('volumes', {}).get(source, {}).get('name')
            require(kind in ('volume', 'bind') and bool(source), f'{service}: unsupported mount')
            expected.append((kind, source, mount.get('target'), not mount.get('read_only', False)))
        actual = [(m.get('Type'), m.get('Name') if m.get('Type') == 'volume' else m.get('Source'),
                   m.get('Destination'), m.get('RW')) for m in live.get('Mounts', [])]
        require(sorted(expected) == sorted(actual), f'{service}: planned/live mount mismatch')
        if service == 'db':
            require(('bind', PGDATA, '/var/lib/postgresql/data', True) in actual, 'database bind mismatch')
        else:
            require(('volume', APPDATA, '/data', True) in actual, f'{service}: appdata mount mismatch')
            require(all(m.get('Source') == APPDATA_PATH for m in live.get('Mounts', [])
                        if m.get('Type') == 'volume' and m.get('Destination') == '/data'),
                    f'{service}: appdata location mismatch')


def validate_artifact(artifact, sha):
    artifact = pathlib.Path(artifact)
    require(re.fullmatch(r'[0-9a-f]{40}', sha), 'expected full tested SHA')
    require(artifact.is_dir() and not artifact.is_symlink(), 'artifact directory missing or symlink')
    files = list(artifact.rglob('*'))
    require(not any(p.is_symlink() for p in files), 'artifact symlink rejected')
    require((artifact / 'index.html').is_file(), 'artifact index missing')
    require((artifact / '.mih-release-sha').read_text().strip() == sha, 'artifact SHA mismatch')
    entries = {}
    for line in (artifact / '.mih-release-checksums').read_text().splitlines():
        require(len(line) > 66 and re.fullmatch(r'[0-9a-f]{64}', line[:64])
                and line[64:66] == '  ', 'malformed artifact checksum')
        path = pathlib.PurePosixPath(line[66:])
        require(not path.is_absolute() and '..' not in path.parts, 'artifact path escape')
        name = path.as_posix()
        require(name not in entries and name not in ('.mih-release-sha', '.mih-release-checksums'),
                'duplicate or reserved artifact entry')
        entries[name] = line[:64]
    actual = {p.relative_to(artifact).as_posix() for p in files if p.is_file()} - {
        '.mih-release-sha', '.mih-release-checksums'}
    require(actual == set(entries), 'artifact file manifest mismatch')
    for name, checksum in entries.items():
        require(hashlib.sha256((artifact / name).read_bytes()).hexdigest() == checksum,
                'artifact checksum mismatch')


def capture(command):
    result = subprocess.run(command, cwd=REPO, capture_output=True, text=True)
    # Raw stderr/stdout may contain interpolated credentials. Do not print them.
    require(result.returncode == 0, f'{command[0]} read-only check failed (details suppressed)')
    return result.stdout


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sha')
    parser.add_argument('--artifact', type=pathlib.Path)
    parser.add_argument('--artifact-only', action='store_true')
    args = parser.parse_args()
    try:
        if args.artifact_only:
            require(bool(args.sha) and args.artifact is not None, 'artifact and SHA required')
            validate_artifact(args.artifact, args.sha)
            print('office CI artifact preflight OK: SHA and file checksums verified')
            return 0
        require(args.sha is None and args.artifact is None, 'use artifact-only for artifact checks')
        config = json.loads(capture(COMPOSE + ['config', '--format', 'json']))
        live = json.loads(capture(['docker', 'inspect', 'mih-db-1', 'mih-backend-1', 'mih-worker-1']))
        volumes = json.loads(capture(['docker', 'volume', 'inspect', APPDATA]))
        validate_storage(config, live, volumes)
        print('office storage preflight OK: project=mih; pgdata bind unchanged; appdata external unchanged')
    except (ValueError, OSError, KeyError, TypeError):
        print('office storage preflight FAILED; inspect sanitized configuration and mount evidence privately', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
