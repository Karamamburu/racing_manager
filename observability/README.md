# Observability

Logs contain personal data (`userSub`, registrations, etc.), so they must **not** leave Russia (152-FZ, cross-border transfer). Shipping to Grafana Cloud was removed; there is currently no external log collector.

## Where logs live now

| Source | Local | Production / stage |
|--------|-------|--------------------|
| `racing_manager_back` | pretty console + JSON file under `logs/` | JSON on container stdout → Docker `json-file` on the host |
| `competition_managment_service` | pretty console + JSON file under `logs/` | JSON on container stdout → Docker `json-file` on the host |
| Postgres / nginx / Authentik | `docker logs <container>` | `docker logs <container>` on the host |

Local file paths (defaults work if you start from each service directory):

```env
# racing_manager_back/.env
LOG_FILE_PATH=../observability/logs/racing_manager_back.log

# competition_managment_service/.env
LOG_FILE_PATH=../observability/logs/competition_managment_service.log
```

Query on a host:

```bash
docker logs racing_manager_back --since 1h | jq 'select(.event == "registration.created")'
docker logs competition_managment_service --since 1h | jq 'select(.level == "error")'
```

## Planned: Yandex Cloud Logging + DataLens

Target setup (all data stays in RF):

1. Create a log group in [Yandex Cloud Logging](https://yandex.cloud/ru/docs/logging/) (`ru-central1`).
2. Ship container logs with [Fluent Bit + Yandex Cloud Logging plugin](https://yandex.cloud/ru/docs/logging/tutorials/fluent-bit-logging) (or Unified Agent) from the app / data / stage hosts, using a service account with `logging.writer`.
3. Build dashboards in [Yandex DataLens](https://yandex.cloud/ru/docs/datalens/) (via export of the log group to ClickHouse / Object Storage, or directly from Logging).

Until then, do not add any log/metrics/tracing exporter that sends data outside RF.

## Business events

Structured Nest logs include an `event` field (also used as `msg`).

| Service | Events |
|---------|--------|
| back | `auth.login_success`, `auth.logout`, `registration.created` / `.cancelled` / `.status_changed`, `event.created` / `.updated` / `.status_changed` / `.cancelled` / `.status_auto_synced`, `class_competition.*`, `cms.request_failed`, `result.upserted` |
| CMS | `domain_error`, `competition.created` / `.plan_updated`, `stage.seeded` / `.results_recorded` / `.completed` / `.advanced` |

Auth HTTP routes (`/auth/*`) are **not** access-logged — only the business events above. Successful GETs stay at `debug` and are omitted (local file and production stdout both default to `info`).

Pino writes `level` as a string (`info` / `warn` / `error`).

## Sentry Uptime

[Sentry Uptime Monitoring](https://docs.sentry.io/product/monitors-and-alerts/monitors/uptime-monitoring/) probes public HTTP URLs from Sentry’s cloud (not a local Docker service). It only calls `/health` and receives `{ "status": "ok" }` — no personal data is sent. No DSN or `.env` secrets are required — monitors live in the Sentry UI.

### Probe endpoints

| Service | Path | Local check | Prod (after deploy) |
|---------|------|-------------|---------------------|
| `racing_manager_back` | `GET /health` → `{ "status": "ok" }` | `curl http://localhost:4000/health` | `https://DOMAIN/api/health` |
| `competition_managment_service` | `GET /health` → `{ "status": "ok" }` | `curl http://localhost:4100/health` | private (not on public edge) |
| Frontend | `GET /health` → `{ "status": "ok" }` | `curl http://localhost:5173/health` | `https://DOMAIN/health` |

See also [infra/backups/README.md](../infra/backups/README.md).

Liveness only (no DB/MinIO checks). Access logs for `/health` are skipped on both Nest apps.

### Create monitors in Sentry

1. Open your org on [sentry.io](https://sentry.io/) and create a project if needed.
2. **Alerts** → **Create Alert Rule** → **Uptime Monitor**.
3. Add one monitor per public URL (once staging/prod hosts exist):

| Monitor | URL | Method | Interval |
|---------|-----|--------|----------|
| API | `https://<api-host>/health` | GET | 1 minute |
| Front | `https://<front-host>/health` | GET | 1 minute |

4. Expect HTTP 2xx. Optionally wire notifications (email / Slack) for downtime issues.
5. If a firewall sits in front of the apps, allow User-Agent `SentryUptimeBot/1.0` ([docs](https://docs.sentry.io/product/monitors-and-alerts/monitors/uptime-monitoring/troubleshooting/)).

Sentry cannot reach `localhost`. Before deploy, you can temporarily expose a health URL with ngrok or Cloudflare Tunnel and point a monitor at that URL.
