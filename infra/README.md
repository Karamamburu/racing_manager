# Racing Manager — production infra (year 1)

Two-host Docker Compose layout: **data** (Postgres + MinIO) and **app** (nginx TLS + Nest + Authentik + front). See [VPS.md](VPS.md) for rental specs.

```text
Users ──HTTPS──► app nginx
                   ├─ /            → front (static)
                   ├─ /api /media  → racing_manager_back
                   ├─ auth.*       → Authentik
                   └─ media.*      → MinIO (private upstream)

app ──private──► data (Postgres main/CMS/Authentik, MinIO)
```

## Quick start (prod)

1. Complete [VPS.md](VPS.md) checklist.
2. On **data**:

```bash
cd infra/data
cp .env.example .env   # edit secrets
docker compose up -d
```

3. On **app**:

```bash
cd infra/app
cp .env.example .env   # set DATA_HOST, domains, secrets
docker compose up -d --build
./scripts/init-certs.sh   # Let's Encrypt (after DNS points here)
docker compose up -d      # reload nginx with certs
```

4. Configure Authentik OIDC (see [AUTHENTIK.md](AUTHENTIK.md)).
5. Enable backups cron on **data** ([backups/](backups/)).
6. Sentry Uptime → `https://<DOMAIN>/health` and `https://<DOMAIN>/api/health`.

## Stage

Single box: [stage/](stage/).

## Local vs prod

Local stacks under `racing_manager_db/`, `nginx/`, `observability/` stay for development. Prod hardening lives only under `infra/`.

## Layout

| Path | Purpose |
|------|---------|
| [VPS.md](VPS.md) | Rental specs + firewall checklist |
| [data/](data/) | Data VPS compose (Postgres ×3, MinIO, Alloy) |
| [app/](app/) | App VPS compose (nginx TLS, front, API, CMS, Authentik, Alloy) |
| [stage/](stage/) | Single-VPS stage |
| [AUTHENTIK.md](AUTHENTIK.md) | OIDC application setup |
| [backups/](backups/) | pg_dump / MinIO / Sentry notes |
| [scripts/firewall.sh](scripts/firewall.sh) | Example ufw rules |
