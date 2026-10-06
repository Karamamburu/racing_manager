# Backups & observability (prod)

## Postgres

On the **data** host:

```bash
chmod +x infra/backups/*.sh
# edit crontab — see crontab.example
```

`backup.sh` writes custom-format dumps for main, CMS, and Authentik Postgres, prunes after 14 days, and optionally `rsync`s to `BACKUP_OFFSITE`.

Test restore on stage before you need it:

```bash
./infra/backups/restore.sh main /var/backups/racing-manager/latest/postgres_main.dump
```

## Object storage (Timeweb S3)

Media lives in Timeweb Cloud S3 (`s3.twcstorage.ru`). Optional weekly local mirror on the **app** host:

```bash
./infra/backups/backup-s3.sh
```

Timeweb already keeps object durability; this script is an extra offsite/local copy via `aws s3 sync`.

## Alloy → Grafana Cloud Loki

- **data** host: `infra/observability/config.data.alloy` (Postgres containers)
- **app** host: `infra/observability/config.app.alloy` (Nest stdout + app containers)

Credentials: same `GRAFANA_LOKI_*` as local [`observability/`](../observability/).

## Sentry Uptime

Create monitors in Sentry (Alerts → Uptime Monitor) once TLS is live:

| Monitor | URL |
|---------|-----|
| Front | `https://DOMAIN/health` |
| API | `https://DOMAIN/api/health` |

Expect HTTP 2xx. Interval 1 minute. Allow User-Agent `SentryUptimeBot/1.0` if you add a WAF.

CMS stays private — do not expose its `/health` on the public edge.
