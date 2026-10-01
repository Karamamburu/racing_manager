#!/bin/sh
set -eu

# Named volumes are root-owned on first mount; the app user must be able to write logs.
LOG_DIR="${LOG_DIR:-/var/log/racing-manager}"
mkdir -p "$LOG_DIR"
chown -R app:app "$LOG_DIR"

exec su-exec app "$@"
