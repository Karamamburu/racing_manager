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

if grep -q '^TLS_ENABLED=' .env; then
  sed -i.bak 's/^TLS_ENABLED=.*/TLS_ENABLED=true/' .env
else
  echo 'TLS_ENABLED=true' >> .env
fi

docker compose up -d nginx
echo "Stage TLS enabled."
