#!/usr/bin/env bash
# Terapkan migrasi 009/010 ke DB produksi MIH (aditif, aman diulang).
# Backup skema dulu; data tidak disentuh.
set -euo pipefail
cd "$(dirname "$0")/.."

BACKUP_DIR="${BACKUP_DIR:-$HOME/mih-backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR" || { echo "[migrate] tidak bisa membuat $BACKUP_DIR"; exit 1; }

echo "[migrate] backup skema → $BACKUP_DIR/schema-$STAMP.sql"
docker exec mih-db-1 pg_dump -U mih -d mih --schema-only > "$BACKUP_DIR/schema-$STAMP.sql" || {
  echo "[migrate] gagal backup — dibatalkan"; exit 1;
}

for f in db/migrations/009_usage_cost.sql db/migrations/010_daily_metrics.sql; do
  echo "[migrate] $f"
  docker exec -i mih-db-1 psql -v ON_ERROR_STOP=1 -U mih -d mih < "$f"
done

echo "[migrate] verifikasi kolom:"
docker exec mih-db-1 psql -U mih -d mih -tAc "
  SELECT column_name FROM information_schema.columns
  WHERE table_name='usage_logs' AND column_name IN ('token_in','token_out','biaya_usd','sumber')
  ORDER BY 1;"
echo "[migrate] selesai"
