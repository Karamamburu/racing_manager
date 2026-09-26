#!/usr/bin/env bash
# Daily Postgres dumps + weekly MinIO mirror. Run on the data host.
# Usage: ./backup.sh
# Env: copy from infra/data/.env or export BACKUP_ROOT / offsite rsync target.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA_ENV="${DATA_ENV:-${ROOT}/data/.env}"
# shellcheck disable=SC1090
source "$DATA_ENV"

BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/racing-manager}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DAY="$(date -u +%Y%m%d)"
DEST="${BACKUP_ROOT}/${STAMP}"

mkdir -p "$DEST"

echo "==> Dumping Postgres databases into ${DEST}"

docker exec racing_manager_db \
  pg_dump -U "$POSTGRES_MAIN_USER" -d "$POSTGRES_MAIN_DB" --format=custom \
  > "${DEST}/postgres_main.dump"

docker exec competition_managment_db \
  pg_dump -U "$POSTGRES_CMS_USER" -d "$POSTGRES_CMS_DB" --format=custom \
  > "${DEST}/postgres_cms.dump"

docker exec racing_manager_authentik_db \
  pg_dump -U "$POSTGRES_AUTHENTIK_USER" -d "$POSTGRES_AUTHENTIK_DB" --format=custom \
  > "${DEST}/postgres_authentik.dump"

# Weekly MinIO mirror (Sunday UTC) — full bucket copy into backup tree.
if [ "$(date -u +%u)" = "7" ]; then
  echo "==> Weekly MinIO mirror"
  mkdir -p "${DEST}/minio"
  docker run --rm --network container:racing_manager_minio \
    -v "${DEST}/minio:/backup" \
    -e MINIO_ROOT_USER -e MINIO_ROOT_PASSWORD -e MINIO_BUCKET \
    quay.io/minio/mc:RELEASE.2025-08-13T08-35-41Z \
    /bin/sh -c '
      mc alias set local http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
      mc mirror --overwrite "local/$MINIO_BUCKET" /backup
    '
fi

# Keep a "latest" pointer for easy restore drills
ln -sfn "$DEST" "${BACKUP_ROOT}/latest"

echo "==> Pruning backups older than ${RETENTION_DAYS} days"
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name '20*' -mtime "+${RETENTION_DAYS}" -exec rm -rf {} +

# Optional offsite (set BACKUP_OFFSITE=user@host:/path)
if [ -n "${BACKUP_OFFSITE:-}" ]; then
  echo "==> Syncing to ${BACKUP_OFFSITE}"
  rsync -a --delete "${BACKUP_ROOT}/" "$BACKUP_OFFSITE"
fi

echo "==> Done ${DEST}"
echo "$DAY" > "${BACKUP_ROOT}/.last_success"
