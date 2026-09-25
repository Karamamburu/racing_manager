# Observability (Grafana Cloud Loki via Alloy)

Local [Grafana Alloy](https://grafana.com/docs/alloy/latest/) ships logs to your Grafana Cloud Loki stack. View them at [deniskhmyrov.grafana.net](https://deniskhmyrov.grafana.net/) → **Explore** → datasource **Loki**.

## What is collected

| Source | How | Labels |
|--------|-----|--------|
| `racing_manager_back` | JSON file under `logs/` | `job=nest`, `service=racing_manager_back` |
| `competition_managment_service` | JSON file under `logs/` | `job=nest`, `service=competition_managment_service` |
| Postgres / MinIO containers | Docker socket | `job=docker`, `container=<name>` |

Containers included: `racing_manager_db`, `racing_manager_minio`, `racing_manager_minio_init`, `competition_managment_db`.

## Setup

1. Copy credentials (never commit `.env`):

```bash
cp .env.example .env
```

Fill from Grafana Cloud Portal → your stack → **Loki** → **Details** (or **Connections** → Alloy snippet):

- `GRAFANA_LOKI_URL` — push URL ending in `/loki/api/v1/push`  
  (Sweden / `prod-eu-north-0`: `https://logs-prod-025.grafana.net/loki/api/v1/push` — **not** `*.grafana.net` instance URL)
- `GRAFANA_LOKI_USERNAME` — **numeric** Loki User / Instance ID from the Loki card (digits only, not the stack slug)
- `GRAFANA_LOKI_TOKEN` — access policy token with `logs:write` (starts with `glc_`)

Put secrets only in `.env` (never in `.env.example`).

2. Start Alloy:

```bash
docker compose up -d
```

UI metrics: http://localhost:12345

3. Point Nest apps at log files (defaults work if you start from each service directory):

```env
# racing_manager_back/.env
LOG_FILE_PATH=../observability/logs/racing_manager_back.log

# competition_managment_service/.env
LOG_FILE_PATH=../observability/logs/competition_managment_service.log
```

4. Run backends (`npm run start:dev`) and ensure DB/MinIO compose stacks are up.

## Example LogQL

```logql
{service="racing_manager_back"}
{service="competition_managment_service"}
{container="racing_manager_db"}
{container="racing_manager_minio"}
{job="docker"}
{job="nest"}
```

## Business events

Structured Nest logs include an `event` field. Parse JSON in Explore:

```logql
{service="racing_manager_back"} | json | event=~"registration.*"
{service="racing_manager_back"} | json | event="auth.login_success"
{service="racing_manager_back"} | json | event="event.status_changed"
{service="racing_manager_back"} | json | event="cms.request_failed"
{service="racing_manager_back"} | json | event=~"class_competition.*"
{service="competition_managment_service"} | json | event="domain_error"
{service="competition_managment_service"} | json | event=~"stage\\..*"
{service="competition_managment_service"} | json | event=~"competition\\..*"
```

Notable `event` values:

| Service | Events |
|---------|--------|
| back | `auth.login_success`, `auth.logout`, `registration.created` / `.cancelled` / `.status_changed`, `event.created` / `.updated` / `.status_changed` / `.cancelled` / `.status_auto_synced`, `class_competition.*`, `cms.request_failed`, `result.upserted` |
| CMS | `domain_error`, `competition.created` / `.plan_updated`, `stage.seeded` / `.results_recorded` / `.completed` / `.advanced` |

Auth HTTP routes (`/auth/*`) are **not** access-logged — only the business events above go to Loki. Successful GETs stay at `debug` on the console and are omitted from the log file (default `LOG_FILE_LEVEL=info`).

Pino writes `level` as a string (`info` / `warn` / `error`) so Grafana Explore shows the correct severity instead of **UNK**.

Docker/Postgres logs go through Alloy `loki.process`: Postgres `LOG`/`WARNING`/`ERROR`/… are mapped to Grafana levels (`info`/`warn`/`error`/…).

## Sentry Uptime

[Sentry Uptime Monitoring](https://docs.sentry.io/product/monitors-and-alerts/monitors/uptime-monitoring/) probes public HTTP URLs from Sentry’s cloud (not a local Docker service). No DSN or `.env` secrets are required for uptime — monitors live in the Sentry UI.

### Probe endpoints

| Service | Path | Local check |
|---------|------|-------------|
| `racing_manager_back` | `GET /health` → `{ "status": "ok" }` | `curl http://localhost:4000/health` |
| `competition_managment_service` | `GET /health` → `{ "status": "ok" }` | `curl http://localhost:4100/health` |
| Frontend | `GET /health` → `{ "status": "ok" }` | `curl http://localhost:5173/health` |

Liveness only (no DB/MinIO checks). Access logs for `/health` are skipped on both Nest apps.

### Create monitors in Sentry

1. Open your org on [sentry.io](https://sentry.io/) and create a project if needed.
2. **Alerts** → **Create Alert Rule** → **Uptime Monitor**.
3. Add one monitor per public URL (once staging/prod hosts exist):

| Monitor | URL | Method | Interval |
|---------|-----|--------|----------|
| API | `https://<api-host>/health` | GET | 1 minute |
| CMS | `https://<cms-host>/health` | GET | 1 minute |
| Front | `https://<front-host>/health` | GET | 1 minute |

4. Expect HTTP 2xx. Optionally wire notifications (email / Slack) for downtime issues.
5. If a firewall sits in front of the apps, allow User-Agent `SentryUptimeBot/1.0` ([docs](https://docs.sentry.io/product/monitors-and-alerts/monitors/uptime-monitoring/troubleshooting/)).

Sentry cannot reach `localhost`. Before deploy, you can temporarily expose a health URL with ngrok or Cloudflare Tunnel and point a monitor at that URL.
