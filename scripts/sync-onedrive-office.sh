#!/usr/bin/env bash
# Host-only office ingestion. Copy never deletes destination files.
set -euo pipefail

config=${RCLONE_CONFIG:-/home/hrmaulana/.config/rclone/rclone.conf}
source=${RCLONE_SOURCE:-onedrive:Pengetahuan PMP}
destination=${RCLONE_DESTINATION:-/data/mih/rclone/Pengetahuan PMP}

fail() { printf 'onedrive-office: %s\n' "$*" >&2; exit 2; }

# Exact allowlist: remote root, Backup MIH and traversal are never accepted.
[[ "$source" == 'onedrive:Pengetahuan PMP' ]] || fail 'source must be onedrive:Pengetahuan PMP'
[[ "$destination" == '/data/mih/rclone/Pengetahuan PMP' ]] || fail 'destination must be the office folder'
[[ "$config" == /* && -f "$config" && -r "$config" && -s "$config" ]] || fail 'config must be an absolute, readable, nonempty file'

# Override config/lock/timeout for host installation; source/destination stay allowlisted.
lock_file=${RCLONE_LOCK_FILE:-/data/mih/rclone/.onedrive-office.lock}
duration=${RCLONE_TIMEOUT:-30m}
[[ "$lock_file" == /* ]] || fail 'lock path must be absolute'
[[ "$duration" =~ ^([0-9]+)(\.[0-9]+)?[smhd]?$ && "$duration" =~ [1-9] ]] || fail 'timeout must be a positive duration'
for dependency in rclone flock timeout; do
    command -v "$dependency" >/dev/null || fail "missing dependency: $dependency"
done

# The parent directory must already exist; leave the lock inode in place.
exec 9>"$lock_file"
flock -n -E 75 9 || exit "$?"
timeout --signal=TERM --kill-after=10s "$duration" \
    rclone copy "$source" "$destination" --config "$config"
