#!/usr/bin/env bash
# Example host firewall for ufw. Edit APP_PRIVATE_IP / ADMIN_CIDR before use.
# Run on each host after first SSH login.
set -euo pipefail

ROLE="${1:?usage: firewall.sh <app|data>}"
ADMIN_CIDR="${ADMIN_CIDR:-0.0.0.0/0}" # prefer your office/VPN CIDR
APP_PRIVATE_IP="${APP_PRIVATE_IP:?set APP_PRIVATE_IP to the app host private IP}"

if ! command -v ufw >/dev/null; then
  echo "ufw not installed" >&2
  exit 1
fi

ufw default deny incoming
ufw default allow outgoing
ufw allow from "$ADMIN_CIDR" to any port 22 proto tcp comment 'ssh'

case "$ROLE" in
  app)
    ufw allow 80/tcp comment 'http'
    ufw allow 443/tcp comment 'https'
    ;;
  data)
    ufw allow from "$APP_PRIVATE_IP" to any port 5432 proto tcp comment 'postgres-main'
    ufw allow from "$APP_PRIVATE_IP" to any port 5433 proto tcp comment 'postgres-cms'
    ufw allow from "$APP_PRIVATE_IP" to any port 5434 proto tcp comment 'postgres-authentik'
    ufw allow from "$APP_PRIVATE_IP" to any port 9000 proto tcp comment 'minio'
    ;;
  *)
    echo "unknown role: $ROLE" >&2
    exit 1
    ;;
esac

ufw --force enable
ufw status verbose
