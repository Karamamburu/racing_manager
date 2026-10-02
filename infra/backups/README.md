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

## MinIO

On the **app** host (MinIO runs there):

```bash
# weekly — see crontab.example
./infra/backups/backup-minio.sh
```

`backup-minio.sh` mirrors the media bucket into `/var/backups/racing-manager/minio/`, prunes after 14 days, and optionally `rsync`s to `BACKUP_OFFSITE`.

## Alloy → Grafana Cloud Loki

- **data** host: `infra/observability/config.data.alloy` (Postgres containers)
- **app** host: `infra/observability/config.app.alloy` (Nest log files + app/MinIO containers)

Credentials: same `GRAFANA_LOKI_*` as local [`observability/`](../observability/).

## Sentry Uptime

Create monitors in Sentry (Alerts → Uptime Monitor) once TLS is live:

| Monitor | URL |
|---------|-----|
| Front | `https://DOMAIN/health` |
| API | `https://DOMAIN/api/health` |

Expect HTTP 2xx. Interval 1 minute. Allow User-Agent `SentryUptimeBot/1.0` if you add a WAF.

CMS stays private — do not expose its `/health` on the public edge.
