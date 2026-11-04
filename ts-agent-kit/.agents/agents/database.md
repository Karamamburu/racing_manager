# Database rules

## Stack

- PostgreSQL.
- Prisma is the only schema owner. The schema file is `apps/api/prisma/schema.prisma`.
- Application code talks to the database through a repository that uses `PrismaService` (a thin wrapper around `PrismaClient`).
- Local PostgreSQL comes from Docker Compose. Tests use a disposable database, not the developer's main database.

## Migrations

- A schema change ships a migration under `apps/api/prisma/migrations/<timestamp>_<name>/`.
- Generate with Prisma, then read the SQL. Autogenerate can drop a column or index you did not mean to touch.
- Every migration directory contains `down.sql`. It reverses that migration's SQL: drop what was created, in reverse dependency order. An empty file stops the task.
- `down.sql` does not edit `_prisma_migrations`. The migration skill's pendulum does that on a disposable database only.
- Do not use `prisma db push` on a shared database. Do not `CREATE` or `ALTER` by hand and call the schema done.
- A new required column needs a default or a backfill step that is in the migration, not a hope that old rows are empty.
- Name indexes and foreign keys explicitly in the schema (`@map`, `@@index`, `onDelete`).

## Expand and contract

Dropping or renaming a column, table, or enum value that production already stores is two or more migrations:

1. Add the new shape. Write both. Read from the old shape if needed.
2. Backfill.
3. Switch readers.
4. Remove the old shape in a later migration, after the previous release is live.

A single migration that `DROP COLUMN`s live data is a stop unless the task explicitly accepts data loss.

## Repositories and transactions

- Services do not call `prisma.<model>.*` directly. Repositories do.
- A repository method runs on the client it was given (the root client or a transaction client). It does not call `$transaction`.
- The service opens `prisma.$transaction` when a use case writes more than one row that must commit or roll back together.
- Interactive transactions stay short. No outbound HTTP inside `$transaction`.

## What to test

- Query shape, constraints, and transactions are integration tests against real PostgreSQL. Not SQLite, not an in-memory Prisma mock.
- Each test starts from a clean database or a transaction that rolls back. See `.agents/agents/testing.md`.
