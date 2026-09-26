#!/usr/bin/env bash
# Restore a custom-format dump into a running Postgres container.
# Usage:
#   ./restore.sh main /var/backups/racing-manager/latest/postgres_main.dump
#   ./restore.sh cms  /path/to/postgres_cms.dump
#   ./restore.sh authentik /path/to/postgres_authentik.dump
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA_ENV="${DATA_ENV:-${ROOT}/data/.env}"
# shellcheck disable=SC1090
source "$DATA_ENV"

TARGET="${1:?usage: restore.sh <main|cms|authentik> <dump-file>}"
DUMP="${2:?dump file required}"

case "$TARGET" in
  main)
    CONTAINER=racing_manager_db
    USER_NAME="$POSTGRES_MAIN_USER"
    DB_NAME="$POSTGRES_MAIN_DB"
    ;;
  cms)
    CONTAINER=competition_managment_db
    USER_NAME="$POSTGRES_CMS_USER"
    DB_NAME="$POSTGRES_CMS_DB"
    ;;
  authentik)
    CONTAINER=racing_manager_authentik_db
    USER_NAME="$POSTGRES_AUTHENTIK_USER"
    DB_NAME="$POSTGRES_AUTHENTIK_DB"
    ;;
  *)
    echo "Unknown target: $TARGET" >&2
    exit 1
    ;;
esac

echo "Restoring ${DUMP} → ${CONTAINER}/${DB_NAME} (destroys existing objects in that DB)"
read -r -p "Type YES to continue: " confirm
[ "$confirm" = "YES" ] || exit 1

docker exec -i "$CONTAINER" \
  pg_restore -U "$USER_NAME" -d "$DB_NAME" --clean --if-exists < "$DUMP"

echo "Restore finished."
