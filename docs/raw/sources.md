---
type: raw
updated: 2026-11-03
---

# Source catalog

Pointers into the repository. Paths are relative to the repo root. Do not copy secrets.

## Product code and schema

| Source | Use |
|---|---|
| `racing_manager_back/prisma/schema.prisma` | Main app data model (source of truth for Prisma client) |
| `racing_manager_db/db/init.sql` | Local Postgres bootstrap schema |
| `racing_manager_db/db/migrate_*.sql` | Incremental SQL history for existing volumes |
| `racing_manager_front/src/App.tsx` | Public routes |
| `racing_manager_back/src/app.module.ts` | API module wiring |

## Package READMEs

| Source | Use |
|---|---|
| `racing_manager_db/README.md` | Local Postgres/MinIO, migrate catalog, S3 env names |
| `competition_managment_service/README.md` | CMS planner/heats API |
| `nginx/README.md` | Local reverse proxy routes |
| `observability/README.md` | Log retention / 152-FZ constraints |
| `infra/README.md` | Prod two-host layout |
| `infra/ACCESS.md` | SSH / host access (ops; handle carefully) |
| `infra/AUTHENTIK.md` | OIDC app setup |
| `infra/stage/README.md` | Stage Compose |
| `infra/backups/README.md` | Backup flow |
| `ts-agent-kit/README.md` | How to use the agent kit |
| `ts-agent-kit/AGENTS.md` | Coding rulebook / skill router |

## Legal / policy

| Source | Use |
|---|---|
| `racing_manager_front/src/pages/PolicyPage/` | Russian personal-data policy / consent copy (152-FZ); summarize in English wiki only |

## First compile

Initial wiki pages (2026-11-03) were synthesized from the sources above plus package layout exploration. See [`../log.md`](../log.md).
