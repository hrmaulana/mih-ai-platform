#!/usr/bin/env bash
# Office only. Default is read-only preflight; apply requires explicit authorization.
# Run the tested script from the runner checkout, NOT an unreviewed host revision.
set -euo pipefail
DEPLOY_DIR=/home/hrmaulana/mih
GUARD="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/deploy-office-preflight.py"
fail() { printf 'Deployment refused: %s\n' "$1" >&2; exit 1; }
[[ $# -ge 2 && $# -le 3 ]] || fail 'usage: deploy.sh TESTED_SHA FRONTEND_ARTIFACT [--apply]'
SHA=$1
ARTIFACT=$2
MODE=${3:---preflight}
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || fail 'full tested SHA required'
[[ "$MODE" == --preflight || "$MODE" == --apply ]] || fail 'unknown mode'
[[ "$(hostname -s)" == keuanganpmp ]] || fail 'wrong host (office keuanganpmp required)'
cd "$DEPLOY_DIR"
[[ "$(pwd -P)" == "$DEPLOY_DIR" ]] || fail 'deployment directory symlink mismatch'
[[ "$(git rev-parse --show-toplevel)" == "$DEPLOY_DIR" ]] || fail 'repository root mismatch'
check_clean() {
  local status
  status=$(git status --porcelain=v1 --untracked-files=all) || fail 'git status check failed'
  [[ -z "$status" ]] || fail 'dirty deployment checkout; preserve/reconcile files manually'
}
check_clean
[[ -f .env.prod && ! -L .env.prod ]] || fail 'production env file missing or symlink'
python3 "$GUARD" --sha "$SHA" --artifact "$ARTIFACT" --artifact-only
# First validate the current storage identity, before changing the checkout.
python3 "$GUARD"
if [[ "$MODE" == --preflight ]]; then
  [[ "$(git rev-parse HEAD)" == "$SHA" ]] || fail 'preflight requires current checkout at tested SHA (no checkout performed)'
  printf 'Read-only office deployment preflight OK; no changes applied\n'
  exit 0
fi
[[ "${MIH_OFFICE_DEPLOY_ENABLED:-false}" == true ]] || fail 'office deployment enable gate is closed'
# Serialize all script invocations on this host (CI concurrency alone is not enough).
exec 9>"/home/hrmaulana/.mih-office-deploy.lock"
flock -n 9 || fail 'another office deployment is active'
check_clean
# Fetch only the tested object, never a moving branch and never force-clean the repo.
# Suppress transport output: private remote URLs may contain credentials.
git fetch --no-tags origin "$SHA" >/dev/null 2>&1 || fail 'fetch tested SHA failed (transport details suppressed)'
[[ "$(git rev-parse FETCH_HEAD)" == "$SHA" ]] || fail 'fetched revision mismatch'
git checkout --detach "$SHA" >/dev/null 2>&1 || fail 'exact checkout failed; reconcile manually'
[[ "$(git rev-parse HEAD)" == "$SHA" ]] || fail 'checked-out revision mismatch'
check_clean
# Revalidate the candidate compose after checkout; no build/up before this passes.
python3 "$GUARD"
python3 "$GUARD" --sha "$SHA" --artifact "$ARTIFACT" --artifact-only
[[ -d frontend && ! -L frontend && ! -L frontend/dist ]] || fail 'frontend artifact destination is unsafe'
INCOMING=$(mktemp -d "$DEPLOY_DIR/frontend/.office-dist.XXXXXX")
trap 'if [[ -n "${INCOMING:-}" && -d "$INCOMING" ]]; then rm -rf -- "$INCOMING"; fi' EXIT
cp -a "$ARTIFACT/." "$INCOMING/"
python3 "$GUARD" --sha "$SHA" --artifact "$INCOMING" --artifact-only
if [[ -e frontend/dist ]]; then
  PREVIOUS=$(mktemp -d /tmp/mih-previous-dist.XXXXXX)
  mv frontend/dist "$PREVIOUS/dist"
fi
mv "$INCOMING" frontend/dist
INCOMING=
COMPOSE=(docker compose -p mih --env-file .env.prod -f docker-compose.prod.yml -f docker-compose.office.yml)
# Backend/worker dependencies still use the approved office proxy. Frontend is COPY dist only.
export HTTP_PROXY=http://proxy.bappenas.go.id:8080
export HTTPS_PROXY=http://proxy.bappenas.go.id:8080
export NO_PROXY=localhost,127.0.0.1
SERVICES=(backend frontend worker analisis-service artikel-service)
for service in "${SERVICES[@]}"; do
  "${COMPOSE[@]}" build --build-arg HTTP_PROXY --build-arg HTTPS_PROXY --build-arg NO_PROXY "$service"
done
# Database/seed never recreated; migrations are a separate reviewed backup-gated action.
python3 "$GUARD"
"${COMPOSE[@]}" up -d --no-build --no-deps "${SERVICES[@]}"
for attempt in {1..20}; do
  if "${COMPOSE[@]}" exec -T frontend wget -q -O /dev/null http://127.0.0.1/ \
      && "${COMPOSE[@]}" exec -T frontend wget -q -O /dev/null http://127.0.0.1/renstra-digital \
      && "${COMPOSE[@]}" exec -T backend bun -e 'for (const path of ["/api/early-warning/summary", "/api/pantau-berita/tren"]) { const r = await fetch("http://127.0.0.1:3000" + path); if (r.status !== 401) process.exit(1); }'; then
    printf 'Office deployed SHA %s; portal/routes respond; authenticated business acceptance still required\n' "$SHA"
    exit 0
  fi
  sleep 3
done
fail 'office smoke failed; no automatic DB rollback, inspect privately (do not dump secret-bearing logs)'
