---
type: package
updated: 2026-11-03
---

# Package: racing_manager_db

Local data stack for the main app: Postgres 16 + MinIO (S3-compatible).

## Facts

- Schema bootstrap: `db/init.sql` (applied only on first empty volume).
- Incremental patches: `db/migrate_*.sql` (apply manually on existing volumes).
- Timezone: `Europe/Moscow` for display/session expectations; timestamps stored as `TIMESTAMPTZ`.
- MinIO API often `localhost:9100`, console `9101` (avoids Authentik on 9000).

## Dual schema story

- **Prisma SoT for the Nest client:** `racing_manager_back/prisma/schema.prisma`.
- **SQL history for local/ops volumes:** `racing_manager_db/db/`.

Schema changes should keep both aligned (Prisma migrate / reviewed SQL + down where the process requires). See [data-model](../concepts/data-model.md).

## Object storage

News HTML stores `/media/...` paths. Switch S3 provider by env names documented in `racing_manager_db/README.md` without rewriting article HTML.

## Links

- Domain storage: [storage](../domains/storage.md)
- Local run: [local-dev](../concepts/local-dev.md)
