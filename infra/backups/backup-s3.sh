#!/usr/bin/env bash
# Weekly S3 mirror (Timeweb Cloud). Run on the app host.
# Requires: aws CLI v2 on the host (or install amazon/aws-cli container).
# Usage: ./backup-s3.sh
# Env: source infra/app/.env or set APP_ENV / BACKUP_ROOT / BACKUP_OFFSITE.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_ENV="${APP_ENV:-${ROOT}/app/.env}"
# shellcheck disable=SC1090
source "$APP_ENV"

: "${S3_ENDPOINT:?S3_ENDPOINT required}"
: "${S3_BUCKET:?S3_BUCKET required}"
: "${S3_ACCESS_KEY:?S3_ACCESS_KEY required}"
: "${S3_SECRET_KEY:?S3_SECRET_KEY required}"

BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/racing-manager}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DAY="$(date -u +%Y%m%d)"
DEST="${BACKUP_ROOT}/s3/${STAMP}"
REGION="${S3_REGION:-ru-1}"

mkdir -p "$DEST"

echo "==> Mirroring s3://${S3_BUCKET} from ${S3_ENDPOINT} into ${DEST}"
docker run --rm \
  -v "${DEST}:/backup" \
  -e AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY" \
  -e AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY" \
  -e AWS_DEFAULT_REGION="$REGION" \
  amazon/aws-cli:2.17.56 \
  s3 sync "s3://${S3_BUCKET}" /backup \
    --endpoint-url "$S3_ENDPOINT"

ln -sfn "$DEST" "${BACKUP_ROOT}/s3/latest"

echo "==> Pruning S3 backups older than ${RETENTION_DAYS} days"
find "${BACKUP_ROOT}/s3" -mindepth 1 -maxdepth 1 -type d -name '20*' -mtime "+${RETENTION_DAYS}" -exec rm -rf {} +

if [ -n "${BACKUP_OFFSITE:-}" ]; then
  echo "==> Syncing to ${BACKUP_OFFSITE}"
  rsync -a --delete "${BACKUP_ROOT}/" "$BACKUP_OFFSITE"
fi

echo "==> Done ${DEST}"
echo "$DAY" > "${BACKUP_ROOT}/s3/.last_success"
