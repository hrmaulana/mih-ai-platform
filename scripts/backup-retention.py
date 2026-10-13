#!/usr/bin/env python3
"""Conservative 14-daily / 4-weekly / 3-monthly remote retention."""
import argparse
import datetime as dt
import json
from pathlib import Path
import re
import sys

NAME = re.compile(r'^mih-office-(\d{8}T\d{6}Z)-[0-9a-f]{12}\.gpg$')


def plan_retention(entries):
    names = {entry['Name'] for entry in entries if not entry.get('IsDir', False)}
    snapshots = []
    for name in names:
        match = NAME.fullmatch(name)
        if match:
            try:
                stamp = dt.datetime.strptime(match[1], '%Y%m%dT%H%M%SZ')
            except ValueError:
                continue
            snapshots.append((stamp, name))
    snapshots.sort(reverse=True)
    # Orphans are protected, not candidates for automatic removal.
    paired = [(stamp, name) for stamp, name in snapshots
              if name[:-4] + '.manifest.json' in names]
    keep = set(name for _, name in snapshots if name[:-4] + '.manifest.json' not in names)
    for fmt, limit in [('%Y-%m-%d', 14), ('%G-%V', 4), ('%Y-%m', 3)]:
        buckets = set()
        for stamp, name in paired:
            bucket = stamp.strftime(fmt)
            if bucket not in buckets and len(buckets) < limit:
                buckets.add(bucket)
                keep.add(name)
    delete = [name for _, name in paired if name not in keep]
    return {'dry_run': True, 'keep': sorted(keep), 'delete': delete,
            'latest': snapshots[0][1] if snapshots else None}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inventory', type=Path, help='Offline lsjson fixture; dry-run only')
    parser.add_argument('--remote', default='onedrive:Backup MIH')
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--recovery-key-confirmed', action='store_true',
                        help='Operator attests the user saved a separate recovery key')
    args = parser.parse_args()
    from backup_support import BackupError, command, remote_folder, validate_manifest, verify_remote
    import fcntl
    import os
    import tempfile
    os.umask(0o077)
    if args.apply and not args.recovery_key_confirmed:
        parser.error('--apply requires --recovery-key-confirmed')
    if args.apply and args.inventory:
        parser.error('offline inventory cannot authorize deletions')
    try:
        remote = remote_folder(args.remote)
        if args.inventory:
            entries = json.loads(args.inventory.read_text())
            print(json.dumps(plan_retention(entries), sort_keys=True))
            return 0
        # Share backup's local advisory lock so rotations cannot race its publication.
        state = Path(os.environ.get('MIH_BACKUP_STATE_DIR', '/var/backups/mih-encrypted'))
        if args.apply:
            state.mkdir(parents=True, exist_ok=True, mode=0o700)
            lock = (state / '.backup.lock').open('a')
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as exc:
                raise BackupError('backup-already-running') from exc
        else:
            lock = None
        try:
            entries = json.loads(command(['rclone', 'lsjson', remote, '--files-only']))
            plan = plan_retention(entries)
            if not args.apply:
                print(json.dumps(plan, sort_keys=True))
                return 0
            latest = plan['latest']
            if latest is None:
                raise BackupError('no-latest-backup')
            if any(entry['Name'].endswith('.partial') and entry['Name'].startswith('mih-office-') for entry in entries):
                raise BackupError('incomplete-remote-publication')
            manifest = json.loads(command(['rclone', 'cat', remote + '/' + latest[:-4] + '.manifest.json']))
            validate_manifest(manifest, latest)
            if manifest.get('offsite_verified') is not True or manifest.get('dump_verified') is not True:
                raise BackupError('latest-backup-not-verified')
            created = dt.datetime.fromisoformat(manifest['created_at'])
            now = dt.datetime.now(dt.timezone.utc)
            if created.tzinfo is None or not dt.timedelta(0) <= now - created <= dt.timedelta(hours=36):
                raise BackupError('latest-backup-not-fresh')
            with tempfile.TemporaryDirectory(prefix='mih-retention-') as tmp:
                verify_remote(manifest, remote + '/' + latest, tmp)
            # Validate every deletion pair before making the first destructive call.
            for name in plan['delete']:
                old = json.loads(command(['rclone', 'cat', remote + '/' + name[:-4] + '.manifest.json']))
                validate_manifest(old, name)
                if old.get('offsite_verified') is not True or old.get('dump_verified') is not True:
                    raise BackupError('old-backup-not-verified')
            for name in plan['delete']:
                command(['rclone', 'deletefile', remote + '/' + name])
                command(['rclone', 'deletefile', remote + '/' + name[:-4] + '.manifest.json'])
            plan['dry_run'] = False
            print(json.dumps(plan, sort_keys=True))
            return 0
        finally:
            if lock:
                lock.close()
    except (BackupError, OSError, ValueError, KeyError, TypeError) as exc:
        reason = str(exc) if isinstance(exc, BackupError) else 'invalid-input-or-filesystem-error'
        print(json.dumps({'status': 'failed', 'reason': reason}), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
