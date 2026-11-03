---
type: concept
updated: 2026-11-03
sources:
  - racing_manager_back/prisma/schema.prisma
  - racing_manager_db/README.md
---

# Concept: Data model

## Source of truth

- **Prisma schema** for the Nest client: `racing_manager_back/prisma/schema.prisma` (client under `generated/prisma`).
- **SQL bootstrap + patches** for local/ops volumes: `racing_manager_db/db/init.sql` and `migrate_*.sql`.

Keep them aligned when changing tables/enums. Prefer reviewed migrations and a down path when the agent-kit database skill is in use.

## Core aggregates

User/Role → Event/Track → Registration/Result → ClassCompetition (CMS) → PersonalConsentEvent → News/Media.

Enums of note: `SportType`, `EventKind`, `EventStatus`, `RegistrationStatus`, personal consent document/action/source. Details on entity pages.

## CMS database

Separate Postgres for `competition_managment_service`. Do not mix connection strings with the main app DB.

## Links

- Entities under [`../entities/`](../entities/) · [db package](../packages/db.md)
