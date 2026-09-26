#!/bin/sh
set -eu

: "${DOMAIN:?DOMAIN is required}"
: "${AUTH_DOMAIN:?AUTH_DOMAIN is required}"
: "${MEDIA_DOMAIN:?MEDIA_DOMAIN is required}"
: "${UPSTREAM_FRONT:?UPSTREAM_FRONT is required}"
: "${UPSTREAM_API:?UPSTREAM_API is required}"
: "${UPSTREAM_AUTHENTIK:?UPSTREAM_AUTHENTIK is required}"
: "${UPSTREAM_MINIO:?UPSTREAM_MINIO is required}"
: "${UPSTREAM_MINIO_HOST:?UPSTREAM_MINIO_HOST is required}"

TLS_ENABLED="${TLS_ENABLED:-false}"
TEMPLATE="/etc/nginx/nginx.http.conf.template"

if [ "$TLS_ENABLED" = "true" ] \
  && [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ] \
  && [ -f "/etc/letsencrypt/live/${DOMAIN}/privkey.pem" ]; then
  TEMPLATE="/etc/nginx/nginx.tls.conf.template"
fi

envsubst '${DOMAIN} ${AUTH_DOMAIN} ${MEDIA_DOMAIN} ${UPSTREAM_FRONT} ${UPSTREAM_API} ${UPSTREAM_AUTHENTIK} ${UPSTREAM_MINIO} ${UPSTREAM_MINIO_HOST}' \
  < "$TEMPLATE" \
  > /etc/nginx/nginx.conf

nginx -t
exec nginx -g 'daemon off;'
