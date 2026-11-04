---
type: package
updated: 2026-11-03
---

# Package: competition_managment_service (CMS)

Sport-agnostic competition engine: stages, heats, seeding, advancement. Called by the main API; **not** a public frontend.

## Stack

NestJS 11, Prisma 6 → separate Postgres (local Compose often on port **5434**). Layers: `domain/`, `http/`, `persistence/`, `presets/`.

## Organizer cycle

1. `POST /v1/plans/propose` (or create competition without preset → planner from entry list).
2. Optional `PUT /v1/competitions/:id/plan` while `DRAFT` (or pending remaining stages later).
3. Seed / start-lists → record results → proposal → advance.

Defaults: preferred heat size 6, max 8. Preset `knockout-24` remains; prefer planner for arbitrary field size.

## Compute vs persisted

- Stateless: formats validate, plans propose/revise, start-lists, advance.
- Persisted: competitions CRUD, plan snapshot, stage start-lists / heats / advance.

Main app maps class competitions under `racing_manager_back` `class-competitions` module. Entity bridge: [class-competition](../entities/class-competition.md).

## Links

- Package README: `competition_managment_service/README.md`
- Domain: [cms](../domains/cms.md)
