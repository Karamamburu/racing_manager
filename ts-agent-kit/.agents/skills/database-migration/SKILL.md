---
name: database-migration
description: >
  Creates a Prisma migration for a PostgreSQL schema change and a reviewed
  down.sql, then proves upgrade, rollback, and re-upgrade on a disposable
  database. Use when tables, columns, indexes, or foreign keys change. Do not
  use for data edits that do not change the schema.
owner: tbd
freedom: strict
last_reviewed: 2026-10-28
---

# Skill: Database migration

## 1. When

- **Use when** `apps/api/prisma/schema.prisma` gains or changes a model, field, enum, index, or relation.
- **Do not use when** the schema stays the same (a data backfill with no DDL is a different task and needs an explicit human yes).

## 2. Inputs

- Characterization tests are green if that suite exists.
- A disposable PostgreSQL is running. `prisma migrate status` matches the current migrations. Do not use the developer's primary database.
- You have read `.agents/agents/database.md`.

## 3. Steps

### Phase 1: Schema

1. Edit `apps/api/prisma/schema.prisma`.
2. Do not create tables from application code (`prisma.$executeRaw` of DDL, or `db push` against a shared database).

### Phase 2: Revision

1. From `apps/api`, generate the migration:

```bash
pnpm exec prisma migrate dev --name <slug> --create-only
```

2. Read `migration.sql`. Check explicit index and foreign-key names, `ON DELETE` behavior, and a default or backfill for every new required column.
3. Write `down.sql` in the same directory. It reverses this migration only: drop new indexes and constraints, drop new columns or tables, in an order that respects foreign keys. No empty file. Do not put a `DELETE` from `_prisma_migrations` in `down.sql`.

### Phase 3: Pendulum

Prisma Migrate does not apply `down.sql` for you. On the disposable database:

1. `pnpm exec prisma migrate deploy`
2. Apply `down.sql` with `psql` (or `prisma db execute --file down.sql --schema prisma/schema.prisma`).
3. Remove that migration's row so deploy will apply it again:

```sql
DELETE FROM "_prisma_migrations" WHERE migration_name = '<timestamp>_<slug>';
```

4. `pnpm exec prisma migrate deploy`
5. `pnpm exec prisma migrate status` reports the database is up to date.

Step 3 runs only against the disposable database. Do not delete migration rows in a shared or production database.

## 4. Outputs

- `apps/api/prisma/migrations/<timestamp>_<slug>/migration.sql`
- `apps/api/prisma/migrations/<timestamp>_<slug>/down.sql`

## 5. Definition of done

1. The pendulum in phase 3 finishes with status up to date.
2. `pnpm exec prisma migrate status` returns 0.
3. `pnpm test` returns 0.
4. `pnpm lint`, `pnpm format:check`, and `pnpm typecheck` return 0 when application code changed to match the schema.

## 6. Stop and rollback

- Do not drop or rename a column that already stores data without an expand-and-contract plan in `.agents/agents/database.md`.
- Do not fix a drift by editing the live database outside a migration file.
- If `down.sql` fails, stop. Restore the new migration directory with git if it is wrong, and report the SQL error. Do not mark the migration applied with `migrate resolve` to hide the failure.
