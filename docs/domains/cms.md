---
type: domain
updated: 2026-11-14
---

# Domain: cms (class competitions)

## Responsibility

Façade from main API to competition engine; plan/start-lists/heats/qualification/heat-times for class competitions.

## Public contracts

- `events/:eventId/class-competitions/*` (main API)
- CMS internal `/v1/...` (not browser-facing) — [cms package](../packages/cms.md)
- Entity: [ClassCompetition](../entities/class-competition.md)

## Multi-stage races inside a start and an age section (START-CATEGORY-BRACKETS)

- A multi-stage race is identified by `event × start × format × gender × frozen target membership`. The target membership is the whole category (`CATEGORY`), an exact base-group set (`CATEGORY_NUMBER`), the unassigned group set (`REMAINDER`) or the unusable-birth-year marker (`NO_BIRTH_YEAR`). A positional stored `CATEGORY_n` is never the identity.
- `POST /events/:eventId/class-competitions` takes `sectionId` and, whenever the event has starts, a `startId` belonging to the event. Format and gender resolve against that start; a start-less legacy event keeps the registration as the participation unit and `CATEGORY`. The field must be frozen first: either the registration window is closed or every active registration already holds a start number. Before the window closes, a missing active number keeps creation refused.
- The field is the active enrollments of the race's own start/format/gender in the target membership. It is captured once, in start-number order; later configuration saves, withdrawals or additions never add or remove a participant.
- Several races may coexist in one protocol category. `CATEGORY` is creatable only when the category is unsplit and no other race exists; a section race cannot be created beside a `CATEGORY` race.
- Each protocol row exposes additive `raceId` and `raceRole` (`CAPTURED` | `OUTSIDE_RACE`). A row joins a race section only when captured, or when its current target membership exactly equals that race's frozen membership; otherwise it stays in its configuration-derived simple section.
- A `CATEGORY` race suppresses the age-category configuration for the whole protocol category. A section race suppresses nothing; sibling configured sections stay visible, ranked and timeable.
- Ordinary result entry is rejected only for rows displayed in a race section. Race heat times/results write to the race start's enrollment. Start numbers are read-only event-wide while the participant appears in any race section.
- A race cannot be created while a running timing attempt's participant would enter its field; timing excludes race-section rows and never writes heat times. See [timing](timing.md).
- «Завершить гонку» remains one action per start × format × gender, is rejected while any race of the category is not `DONE`, and treats a `DONE` race as satisfying completeness for its captured field. Simple-section snapshots stay per section and enrollment.
- Existing races are backfilled to the event's single/first start and `CATEGORY`; the migration is idempotent and reports anomalies. The competition service exposes `DELETE /v1/competitions/:id` for creation compensation; it adds no product race-deletion action.

## Timing heat attempts (MANUAL-TIMING-2)

- A timing attempt may target one heat of one stage of a multi-stage race (event + race + stage + heat number). The heat roster is the heat start list resolved to race-start enrollments; N is the race start lap count.
- A closed heat publishes `ClassHeatTime` rows: `OK` + total for every participant at N, `DNS` when no capture exists and `DNF` when captures exist but fewer than N; an `OK` row also gets one `ClassHeatLapTime` per event lap from the attempt's splits. It writes no ordinary result, event split, place or qualification change and no CMS write. A total or a DNS/DNF status is a complete slot for stage commitment; the stage panel shows the timing total beside the lap rows, and «Зафиксировать этап» is available without per-lap rows. Stage commitment remains a separate CMS-panel action.
- The manual heat-time form and stage seeding/reassignment/removal/commit keep `ORGANIZER`/`ADMINISTRATOR` access. A running heat attempt refuses a manual write for that heat; stage commitment and structural stage changes are refused while any heat attempt of the stage runs.
- «Завершить гонку» is refused while any category or heat attempt of the protocol category runs. See [timing](timing.md).

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
- A race identity reverts to event × format × gender, or a row is routed by a stored `CATEGORY_n` instead of the frozen membership.
- Several races in one protocol category coalesce, or a section race suppresses a sibling configured section.
- Ordinary result entry is blocked for a simple section because a sibling section has a race.
- Migration binds a race to anything other than the single/first start and `CATEGORY`.
- A race created while its field would capture a participant of a running timing attempt; timing writing an ordinary result/split or advancing the stage; a manual heat-time write or stage commit allowed while a timing heat attempt runs.
