# Backups & observability (prod)

## Postgres + MinIO

On the **data** host:

```bash
chmod +x infra/backups/*.sh
# edit crontab — see crontab.example
```

`backup.sh` writes custom-format dumps for main, CMS, and Authentik Postgres, mirrors MinIO weekly, prunes after 14 days, and optionally `rsync`s to `BACKUP_OFFSITE`.

Test restore on stage before you need it:

```bash
./infra/backups/restore.sh main /var/backups/racing-manager/latest/postgres_main.dump
```

## Alloy → Grafana Cloud Loki

- **data** host: `infra/observability/config.data.alloy` (Postgres / MinIO containers)
- **app** host: `infra/observability/config.app.alloy` (Nest log files + app containers)

Credentials: same `GRAFANA_LOKI_*` as local [`observability/`](../observability/).

## Sentry Uptime

Create monitors in Sentry (Alerts → Uptime Monitor) once TLS is live:

| Monitor | URL |
|---------|-----|
| Front | `https://DOMAIN/health` |
| API | `https://DOMAIN/api/health` |

Expect HTTP 2xx. Interval 1 minute. Allow User-Agent `SentryUptimeBot/1.0` if you add a WAF.

CMS stays private — do not expose its `/health` on the public edge.
