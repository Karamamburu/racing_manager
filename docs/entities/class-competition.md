---
type: entity
updated: 2026-11-12
sources:
  - racing_manager_back/prisma/schema.prisma
  - competition_managment_service/README.md
---

# Entity: ClassCompetition

Per-section knockout bracket orchestrated with the internal [CMS](../packages/cms.md).

## App-side

- Bound to Event + Start (or start-less legacy) + ParticipationFormat + gender + frozen target membership.
- Target membership: whole category (`CATEGORY`, `targetWholeCategory`), an exact base-group set (`targetGroupIds`), the unassigned group set (`REMAINDER`) or the unusable-birth-year marker (`NO_BIRTH_YEAR`).
- Frozen display facts: `sectionId` (creation-time), `sectionKind`, `title`, `subtitle`, `youngestBound`, `memberBounds`, `sectionNumber`.
- Captured field snapshots: `capturedEnrollmentIds`, `capturedRegistrationIds`; never recomputed.
- Status: `DRAFT` | `IN_PROGRESS` | `DONE`.
- Heat times / lap results with statuses `OK` | `DNS` | `DNF` | `DSQ`.
- API under `events/:eventId/class-competitions` (plan, start-lists, heats, qualification, heat-times).
- Read model is additive: `startId`, `sectionId`, `sectionKind`, `title`, `subtitle`, `targetGroupIds`, `targetWholeCategory`, `capturedEnrollmentIds`, `youngestBound`.

## CMS-side

Separate DB: Competition → stages → heats/slots/results; planner propose/revise; presets (e.g. `knockout-24`). The CMS is sport-agnostic and receives only the scoped field; main API resolves start, format, gender and age membership.

Main API is the façade; CMS is not browser-facing.

## Links

- Domain: [cms](../domains/cms.md) · Package: [cms](../packages/cms.md)
