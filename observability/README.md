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
