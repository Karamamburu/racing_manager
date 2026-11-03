---
type: concept
updated: 2026-11-03
sources:
  - racing_manager_db/README.md
  - nginx/README.md
  - competition_managment_service/README.md
---

# Concept: Local development

## Typical pieces

1. `racing_manager_db` — `docker compose up -d` (Postgres + MinIO).
2. `racing_manager_back` — Nest API with `DATABASE_URL` and S3 env pointing at local MinIO.
3. `racing_manager_front` — Vite dev server (or nginx SPA).
4. Optional CMS — own Compose (often Postgres `:5434`) + `CMS_BASE_URL` on the API.
5. Optional `nginx` — path routing like prod (`/api`, `/media`).

Apply `db/migrate_*.sql` on **existing** volumes; `init.sql` only seeds empty volumes.

## Secrets

Use local `.env` files (never commit). Wiki and chats must not paste credentials. Env **names** for S3 are listed in `racing_manager_db/README.md`.

## Time

Prefer `Europe/Moscow` for user-facing event dates/status sync.

## Links

- [overview](../overview.md) · [infra](../packages/infra.md)
