---
type: domain
updated: 2026-11-08
---

# Domain: cms (class competitions)

## Responsibility

Façade from main API to competition engine; plan/start-lists/heats/qualification/heat-times for class competitions.

## Public contracts

- `events/:eventId/class-competitions/*` (main API)
- CMS internal `/v1/...` (not browser-facing) — [cms package](../packages/cms.md)
- Entity: [ClassCompetition](../entities/class-competition.md)

## Plan changes and mass-start finals

- A standalone final (no source stage, for example after the judge removed every earlier stage) is seeded with **all participants** as a mass start. The first heat-time write on a PENDING stage with no heats auto-seeds it, so the judge does not have to build start lists manually.
- Explicit plan mutations (`removeStageIds`, `addStages`, `patchHeats`) may rewire the `advancement` of an already `COMPLETED` stage when its downstream stage is removed or added. Completed results and heats are preserved.
- A `SEEDED` or `COMPLETED` stage itself still cannot be removed or have its heats changed, and a stage with participants cannot be deleted.
- Direct format replacement without a plan mutation keeps the strict completed-stage protection.

## Code

- API: `racing_manager_back/src/class-competitions/`
- Service: `competition_managment_service/`
- Front: `features/class-competitions`

## Breakage signals

- CMS plan/advance payload changed without updating the façade.
- `CMS_BASE_URL` or auth assumptions between services changed.
- ClassCompetition status enum diverged from CMS competition states.
- Standalone finals stop seeding all participants, or plan mutations start rejecting completed-stage rewiring.
- Heat-time entry requires a manual seed again for a single-final category.
