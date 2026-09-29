#!/usr/bin/env bash
# Deploy MIH ke VPS publik (vps.arthakarya.id). Frontend dist dibangun di CI
# lalu dikirim sebagai artifact ke runner ini; VPS hanya membangun image Nginx.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

if [ ! -f .env.prod ]; then
  echo ".env.prod belum ada di $DIR — salin dari backup: cp ~/mih.old/.env.prod .env.prod" >&2
  exit 1
fi

if [ ! -f frontend/dist/index.html ]; then
  echo "frontend/dist/index.html tidak ditemukan. Deploy harus menerima artefak hasil build dari CI sebelum skrip ini dijalankan." >&2
  exit 1
fi

COMPOSE="docker compose -p mih --env-file .env.prod -f docker-compose.prod.yml"

echo "=== deploy VPS di: $DIR ==="

# Terapkan migrasi idempoten sebelum backend baru menerima traffic.
for migration in db/migrations/002_early_warnings.sql db/migrations/003_early_warnings_clusters.sql db/migrations/004_pantau_berita_pkpn.sql; do
  echo "=== apply migration $migration ==="
  $COMPOSE exec -T db psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-mih}" -d "${POSTGRES_DB:-mih}" < "$migration"
done

# Backend/worker memakai dependency layer yang dapat di-cache. Frontend Dockerfile
# hanya COPY dist ke nginx; tidak ada npm download/build pada VPS.
build_service() {
  local svc="$1"
  for i in 1 2 3; do
    echo "=== $COMPOSE build $svc (attempt $i) ==="
    if $COMPOSE build "$svc"; then
      return 0
    fi
    echo "build $svc gagal attempt $i, coba lagi dalam 15s..."
    sleep 15
  done
  echo "build $svc gagal 3x berturut-turut — periksa log di atas." >&2
  return 1
}

build_service backend
build_service frontend
build_service worker

echo "=== $COMPOSE up -d --no-build ==="
$COMPOSE up -d --no-build

echo "=== verifikasi portal & Renstra Digital ==="
portal_ok() {
  $COMPOSE exec -T frontend wget -q -O /dev/null http://127.0.0.1/ 2>/dev/null \
    && $COMPOSE exec -T frontend wget -q -O /dev/null http://127.0.0.1/renstra-digital 2>/dev/null
}
ok=""
for i in $(seq 1 20); do
  if portal_ok; then
    ok=1
    echo "portal dan /renstra-digital HTTP 200 (detik ke-$((i * 3)))"
    break
  fi
  sleep 3
done
if [ -z "$ok" ]; then
  echo "portal tidak responsif dalam 60s — status container:" >&2
  $COMPOSE ps >&2
  $COMPOSE logs --tail 30 frontend >&2
  exit 1
fi

api_ok() {
  $COMPOSE exec -T backend bun -e 'const r = await fetch("http://127.0.0.1:3000/api/early-warning/summary"); process.exit(r.status === 401 ? 0 : 1)' 2>/dev/null \
    && $COMPOSE exec -T backend bun -e 'const r = await fetch("http://127.0.0.1:3000/api/pantau-berita/tren"); process.exit(r.status === 401 ? 0 : 1)' 2>/dev/null
}
api_ready=""
for i in $(seq 1 20); do
  if api_ok; then api_ready=1; echo "API Early Warning & Pantau Berita aktif"; break; fi
  sleep 3
done
if [ -z "$api_ready" ]; then
  echo "API Early Warning/Pantau Berita belum sehat" >&2
  $COMPOSE logs --tail 50 backend >&2
  exit 1
fi

echo "=== status container ==="
$COMPOSE ps
echo "=== deploy VPS selesai ==="
