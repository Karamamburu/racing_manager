# Single-VPS stage environment

Use a separate domain and secrets from production (`stage.example.com`). Spec: 2–4 vCPU / 4–8 GB / ~60 GB.

```bash
cd infra/stage
cp .env.example .env   # edit
docker compose up -d --build
./scripts/init-certs.sh   # after DNS
```

OIDC: follow [../AUTHENTIK.md](../AUTHENTIK.md) with stage redirect URIs.

Sentry Uptime: `https://stage…/health` and `https://stage…/api/health`.

Backups: you can run [`../backups/backup.sh`](../backups/backup.sh) on this host too (containers share the same names).
