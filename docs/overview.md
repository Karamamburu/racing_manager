---
type: overview
updated: 2026-11-04
sources:
  - docs/raw/sources.md
---

# Racing Manager — overview

Web platform for organizing and running endurance / racing events (run, ski, roller-ski, bike): calendar, tracks, registrations, results, news, and class-competition heats.

## Package map

| Path | Role |
|---|---|
| [`racing_manager_front`](packages/front.md) | Public SPA (React / Vite / Ant Design) |
| [`racing_manager_back`](packages/back.md) | Main NestJS API + Prisma → Postgres |
| [`competition_managment_service`](packages/cms.md) | Internal competition engine (stages/heats); not public |
| [`racing_manager_db`](packages/db.md) | Local Postgres 16 + MinIO |
| [`nginx`](packages/infra.md) | Local path-based reverse proxy |
| [`infra`](packages/infra.md) | Prod/stage Compose, Authentik, backups |
| [`observability`](packages/infra.md) | Log retention notes (152-FZ: logs stay in RU) |
| [`ts-agent-kit`](concepts/agent-workflow.md) | Agent skills/standards (not product runtime) |

Not a pnpm workspace: independent npm packages under one git repo.

## Core flows

1. **Browse** — calendar, tracks, news, event detail.
2. **Auth** — Authentik OIDC → express-session cookie ([auth-session](concepts/auth-session.md)).
3. **Register** — logged-in or guest registration on an event ([registration](entities/registration.md)).
4. **Cabinet** — profile + personal-data consent ([personal-consent](entities/personal-consent.md)).
5. **Organize** — ADMINISTRATOR / ORGANIZER manage events, news, class competitions via CMS client.

## Compliance note

Personal data processing is constrained by Russian 152-FZ. Full legal text: `racing_manager_front/src/pages/PolicyPage/`. English summary: [personal-consent](entities/personal-consent.md). Policy time limits vs law: [policy-deadlines-152fz](concepts/policy-deadlines-152fz.md). Observability must not ship logs abroad.

## Where to go next

- Change code → [`INDEX.md`](INDEX.md) → one [domain](domains/) page.
- Data shape → [data-model](concepts/data-model.md).
- Local run → [local-dev](concepts/local-dev.md).
