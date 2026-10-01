#!/usr/bin/env bash
# Issue (or renew) a Let's Encrypt cert covering DOMAIN, AUTH_DOMAIN, MEDIA_DOMAIN.
# Run on the app host after DNS A records point here and HTTP nginx is up.
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

# Enable TLS and switch public URLs / cookies to https
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

echo "TLS enabled (PUBLIC_SCHEME=https). Renew later with the same script or a monthly cron."
