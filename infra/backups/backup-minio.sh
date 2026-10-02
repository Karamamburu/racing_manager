#!/usr/bin/env bash
# Weekly MinIO mirror. Run on the app host (MinIO lives there).
# Usage: ./backup-minio.sh
# Env: source infra/app/.env or set APP_ENV / BACKUP_ROOT / BACKUP_OFFSITE.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_ENV="${APP_ENV:-${ROOT}/app/.env}"
# shellcheck disable=SC1090
source "$APP_ENV"

BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/racing-manager}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DAY="$(date -u +%Y%m%d)"
DEST="${BACKUP_ROOT}/minio/${STAMP}"

mkdir -p "$DEST"

echo "==> Mirroring MinIO bucket into ${DEST}"
docker run --rm --network container:racing_manager_minio \
  -v "${DEST}:/backup" \
  -e MINIO_ROOT_USER -e MINIO_ROOT_PASSWORD -e MINIO_BUCKET \
  minio/mc:RELEASE.2025-08-13T08-35-41Z \
  /bin/sh -c '
    mc alias set local http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
    mc mirror --overwrite "local/$MINIO_BUCKET" /backup
  '

ln -sfn "$DEST" "${BACKUP_ROOT}/minio/latest"

echo "==> Pruning MinIO backups older than ${RETENTION_DAYS} days"
find "${BACKUP_ROOT}/minio" -mindepth 1 -maxdepth 1 -type d -name '20*' -mtime "+${RETENTION_DAYS}" -exec rm -rf {} +

if [ -n "${BACKUP_OFFSITE:-}" ]; then
  echo "==> Syncing to ${BACKUP_OFFSITE}"
  rsync -a --delete "${BACKUP_ROOT}/" "$BACKUP_OFFSITE"
fi

echo "==> Done ${DEST}"
echo "$DAY" > "${BACKUP_ROOT}/minio/.last_success"
