#!/usr/bin/env bash
# Safe ufw setup for app / data hosts.
#
# CRITICAL: run over an active SSH (or RDP) session. Rules for 22/3389 are
# added BEFORE `ufw enable`, so you do not lock yourself out again.
#
# Usage (on the target host):
#   export APP_PUBLIC_IP=77.91.95.235          # app → data (Postgres/MinIO)
#   export ADMIN_CIDR=0.0.0.0/0                # or your home/VPN/Tailscale CIDR
#   export ALLOW_RDP=1                         # Ubuntu Desktop xrdp
#   sudo -E ./infra/scripts/firewall.sh data   # on db-server
#   sudo -E ./infra/scripts/firewall.sh app    # on app-server
#
# Beekeeper: do NOT open 5432 to the internet. SSH-tunnel via app (source IP = app):
#   ssh -L 15432:${DATA_HOST}:5432 user@${APP_PUBLIC_IP}
#   Beekeeper → Host 127.0.0.1  Port 15432
set -euo pipefail

ROLE="${1:?usage: firewall.sh <app|data>}"
ADMIN_CIDR="${ADMIN_CIDR:-0.0.0.0/0}"
ALLOW_RDP="${ALLOW_RDP:-1}"
DRY_RUN="${DRY_RUN:-0}"

if [[ "$ROLE" == "data" ]]; then
  APP_PUBLIC_IP="${APP_PUBLIC_IP:?set APP_PUBLIC_IP to the app host public IP (source for Postgres/MinIO)}"
fi

if ! command -v ufw >/dev/null; then
  echo "ufw not installed — run: sudo apt install -y ufw" >&2
  exit 1
fi

run() {
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "DRY: $*"
  else
    "$@"
  fi
}

echo "==> Role: $ROLE"
echo "==> ADMIN_CIDR=$ADMIN_CIDR  ALLOW_RDP=$ALLOW_RDP"
[[ "$ROLE" == "data" ]] && echo "==> APP_PUBLIC_IP=$APP_PUBLIC_IP"

# Wipe previous rules so we do not accumulate junk from a broken setup.
# Active SSH session usually survives until you disconnect.
run ufw --force reset
run ufw default deny incoming
run ufw default allow outgoing

# --- admin access FIRST (before enable) ---
run ufw allow from "$ADMIN_CIDR" to any port 22 proto tcp comment 'ssh'
if [[ "$ALLOW_RDP" == "1" ]]; then
  run ufw allow from "$ADMIN_CIDR" to any port 3389 proto tcp comment 'rdp'
fi

case "$ROLE" in
  app)
    run ufw allow 80/tcp comment 'http'
    run ufw allow 443/tcp comment 'https'
    ;;
  data)
    # Postgres + MinIO only from app. Never from 0.0.0.0/0.
    run ufw allow from "$APP_PUBLIC_IP" to any port 5432 proto tcp comment 'postgres-main'
    run ufw allow from "$APP_PUBLIC_IP" to any port 5433 proto tcp comment 'postgres-cms'
    run ufw allow from "$APP_PUBLIC_IP" to any port 5434 proto tcp comment 'postgres-authentik'
    run ufw allow from "$APP_PUBLIC_IP" to any port 9000 proto tcp comment 'minio-api'
    ;;
  *)
    echo "unknown role: $ROLE (expected app|data)" >&2
    exit 1
    ;;
esac

run ufw --force enable
run ufw status numbered

echo
echo "OK. Verify from another terminal BEFORE closing this session:"
echo "  ssh  → this host"
[[ "$ALLOW_RDP" == "1" ]] && echo "  RDP  → this host:3389"
if [[ "$ROLE" == "data" ]]; then
  echo "  from app: nc -zv \$(hostname -I | awk '{print \$1}') 5432"
fi
echo
echo "Beekeeper (DB stays closed to the world) — tunnel via app:"
echo "  ssh -L 15432:<DATA_HOST>:5432 <user>@<APP_PUBLIC_IP>"
echo "  then connect Beekeeper to 127.0.0.1:15432"
