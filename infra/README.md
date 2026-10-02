# Racing Manager — production infra (year 1)

Two-host Docker Compose layout: **data** (Postgres) and **app** (nginx TLS + Nest + Authentik + front). Media: **Timeweb Cloud S3**. SSH via jump — see [ACCESS.md](ACCESS.md). Specs: [VPS.md](VPS.md).

```text
Users ──HTTPS──► app nginx
                   ├─ /            → front (static)
                   ├─ /api /media  → racing_manager_back
                   ├─ auth.*       → Authentik
                   └─ media.*      → Timeweb S3 proxy (optional; public URLs also hit s3.twcstorage.ru)

app ──private──► data (Postgres main/CMS/Authentik)
app ──HTTPS──► Timeweb S3 (s3.twcstorage.ru)

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
cp .env.example .env   # set DATA_HOST, domains, PUBLIC_SCHEME=http, secrets
docker compose up -d --build
./scripts/init-certs.sh   # Let's Encrypt (after DNS points here)
# init-certs sets TLS_ENABLED=true, PUBLIC_SCHEME=https, SESSION_COOKIE_SECURE=true
docker compose up -d --force-recreate nginx api
```

4. Configure Authentik OIDC (see [AUTHENTIK.md](AUTHENTIK.md)).
5. Enable backups: Postgres cron on **data**, optional S3 mirror on **app** ([backups/](backups/)).
6. Sentry Uptime → `https://<DOMAIN>/health` and `https://<DOMAIN>/api/health`.

## Stage

Single box: [stage/](stage/).

## Local vs prod

Local stacks under `racing_manager_db/`, `nginx/`, `observability/` stay for development. Prod hardening lives only under `infra/`.

## Layout

| Path | Purpose |
|------|---------|
| [ACCESS.md](ACCESS.md) | Host IPs, SSH jump, ufw, Beekeeper tunnel |
| [VPS.md](VPS.md) | Rental specs + firewall checklist |
| [data/](data/) | Data VPS compose (Postgres ×3, Alloy) |
| [app/](app/) | App VPS compose (nginx TLS, front, API, CMS, Authentik, Alloy) |
| [stage/](stage/) | Single-VPS stage |
| [AUTHENTIK.md](AUTHENTIK.md) | OIDC application setup |
| [backups/](backups/) | pg_dump / S3 mirror / Sentry notes |
| [scripts/firewall.sh](scripts/firewall.sh) | Example ufw rules |
