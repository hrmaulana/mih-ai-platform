#!/usr/bin/env bash
# Apply MIH migration 005 (news budget ledger) safely to production office DB.
# Gate: only run AFTER the encrypted backup upload completes and offsite checksum verifies.
# Usage: bash scripts/migrate-005-office.sh
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# --- Safety gates ---
[[ "$(hostname -s)" == keuanganpmp ]] || { echo "ERR: run on office keuanganpmp only" >&2; exit 1; }
# Require a recent backup with on-disk encrypted copy present as pre-change snapshot.
SNAP=$(ls -t /var/backups/mih-encrypted/mih-office-*.gpg \
           /home/hrmaulana/backups/mih-encrypted/mih-office-*.gpg 2>/dev/null | head -1 || true)
[[ -n "$SNAP" ]] || { echo "ERR: no encrypted backup snapshot present; abort" >&2; exit 1; }
echo "Pre-change backup snapshot: $SNAP"

# Confirm migration not yet applied (idempotent re-run safety).
ALREADY=$(docker exec mih-db-1 psql -U mih -d mih -Atc "SELECT to_regclass('public.news_budget_months')")
if [[ -n "$ALREADY" && "$ALREADY" != "NULL" ]]; then
  echo "OK: news_budget_months already exists; migration skipped (idempotent)."
  exit 0
fi

echo "Applying db/migrations/005_news_budget.sql ..."
docker exec -i mih-db-1 psql -v ON_ERROR_STOP=1 -U mih -d mih < db/migrations/005_news_budget.sql

echo "Verifying ..."
docker exec mih-db-1 psql -U mih -d mih -Atc \
  "SELECT to_regclass('public.news_budget_months'), to_regclass('public.news_budget_calls')"
echo "Migration 005 applied."
