---
type: domain
updated: 2026-11-03
---

# Domain: cms (class competitions)

## Responsibility

Façade from main API to competition engine; plan/start-lists/heats/qualification/heat-times for class competitions.

## Public contracts

- `events/:eventId/class-competitions/*` (main API)
- CMS internal `/v1/...` (not browser-facing) — [cms package](../packages/cms.md)
- Entity: [ClassCompetition](../entities/class-competition.md)

## Code

- API: `racing_manager_back/src/class-competitions/`
- Service: `competition_managment_service/`
- Front: `features/class-competitions`

## Breakage signals

- CMS plan/advance payload changed without updating the façade.
- `CMS_BASE_URL` or auth assumptions between services changed.
- ClassCompetition status enum diverged from CMS competition states.
