#!/usr/bin/env bash
# Same as infra/app/scripts/init-certs.sh but for the stage compose directory.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "${ROOT}/.env"

: "${DOMAIN:?}"
: "${AUTH_DOMAIN:?}"
: "${MEDIA_DOMAIN:?}"
: "${CERTBOT_EMAIL:?}"

cd "$ROOT"

docker compose --profile certs run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email "$CERTBOT_EMAIL" \
  --agree-tos \
  --no-eff-email \
  -d "$DOMAIN" \
  -d "$AUTH_DOMAIN" \
  -d "$MEDIA_DOMAIN"

set_env() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" .env; then
    sed -i.bak "s|^${key}=.*|${key}=${value}|" .env
  else
    echo "${key}=${value}" >> .env
  fi
}

set_env TLS_ENABLED true
set_env PUBLIC_SCHEME https
set_env SESSION_COOKIE_SECURE true

docker compose up -d --force-recreate nginx api
echo "Stage TLS enabled (PUBLIC_SCHEME=https)."
