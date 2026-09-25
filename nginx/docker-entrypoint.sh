#!/bin/sh
set -eu

: "${UPSTREAM_FRONT:?UPSTREAM_FRONT is required}"
: "${UPSTREAM_API:?UPSTREAM_API is required}"

envsubst '${UPSTREAM_FRONT} ${UPSTREAM_API}' \
  < /etc/nginx/nginx.conf.template \
  > /etc/nginx/nginx.conf

nginx -t
exec nginx -g 'daemon off;'
