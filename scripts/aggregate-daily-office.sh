#!/usr/bin/env bash
# Agregasi harian Log Harian MIH. Dijalankan systemd timer 00:10.
# Membaca log akses nginx (JSON) dari container frontend, lalu menjalankan
# agregator di container backend. Aman diulang (upsert).
set -euo pipefail
cd "$(dirname "$0")/.."

BACKFILL="${1:-1}"   # jumlah hari ke belakang (default 1 = kemarin + hari ini)
TMP="$(mktemp /tmp/mih-access-XXXXXX.log)"
trap 'rm -f "$TMP"' EXIT

# access.log adalah symlink ke /dev/stdout di image nginx resmi, jadi log dibaca
# dari docker logs (JSON per baris). Baris format lama otomatis dilewati parser.
echo "[harian] ambil log akses dari mih-frontend-1 (docker logs)"
docker logs --since 48h mih-frontend-1 > "$TMP" 2>&1 || true
echo "[harian] $(wc -l < "$TMP") baris log"

docker cp "$TMP" mih-backend-1:/tmp/access.log
docker exec -w /app/backend \
  -e ACCESS_LOG_PATH=/tmp/access.log \
  mih-backend-1 bun scripts/aggregate-daily.ts --backfill "$BACKFILL"

echo "[harian] ringkasan:"
docker exec mih-db-1 psql -U mih -d mih -tAc "
  SELECT tanggal, metrik, nilai FROM daily_metrics
  WHERE kategori='pertanyaan' AND metrik IN ('jumlah','biaya_total_usd')
  ORDER BY tanggal DESC LIMIT 6;" || true
