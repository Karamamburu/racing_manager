---
type: entity
updated: 2026-11-03
sources:
  - racing_manager_back/prisma/schema.prisma
  - competition_managment_service/README.md
---

# Entity: ClassCompetition

Per-event class / knockout-style competition orchestrated with the internal [CMS](../packages/cms.md).

## App-side

- Bound to Event + ParticipationFormat
- Status: `DRAFT` | `IN_PROGRESS` | `DONE`
- Heat times / lap results with statuses `OK` | `DNS` | `DNF` | `DSQ`
- API under `events/:eventId/class-competitions` (plan, start-lists, heats, qualification, heat-times)

## CMS-side

Separate DB: Competition → stages → heats/slots/results; planner propose/revise; presets (e.g. `knockout-24`).

Main API is the façade; CMS is not browser-facing.

## Links

- Domain: [cms](../domains/cms.md) · Package: [cms](../packages/cms.md)
