# Wiki log

Append-only. Prefix every entry with `## [YYYY-MM-DD] ingest|query|lint | Title`.

## [2026-11-08] fix | Upcoming parent registrations sum start enrollments

Fixed the main-page “Ближайшие события” parent “Зарегистрировано” column: it now sums `REGISTERED` enrollments across the event’s starts instead of showing the event-level registration count (which undercounted multi-start participants). Events without starts keep the event-level fallback. Updated [domains/events.md](domains/events.md).

## [2026-11-08] fix | UI-POLISH-4 edit parity, stretching map, hidden event type

Edit-event modal now matches the create modal width/scroll bounds; the map card keeps its minimum height and stretches with the starts card; the event-type control is hidden in both forms while `eventType` stays in the payload; the start purpose label is now “Тип старта”. Also fixed the Postgres UUID row-lock 500 on event save in the same release (`::uuid` casts). Updated [domains/events.md](domains/events.md). Spec: `specs/ui-polish-4-ears.md`.

## [2026-11-08] ingest | UI-POLISH-3 starts card, route colours and nested rows

Third UI iteration: the event page card is now “Старты”, with the map beside it and the description in a separate full-width auto-height card below; the admin description textarea auto-sizes. Starts accept an optional route colour from a fixed six-colour palette persisted with the start and exposed as `routeColor`; start card headers are tinted at 50% opacity and colour stays editable with enrollments. The main-page “Ближайшие события” table renders one child row per start with label, distance and per-start `REGISTERED` count; the parent distance cell is empty. Updated [domains/events.md](domains/events.md), [domains/registrations.md](domains/registrations.md). Spec: `specs/ui-polish-3-ears.md`.

## [2026-11-08] ingest | UI-POLISH-2 start-first registration and tabbed starts

Second UI iteration after user testing: one-click registration moved from the removed event-level “Форматы участия” row into each start block (carrying `startId` + `formatId`); pre- and post-registration confirmations name the start; the per-start “Название” became the first field of each start tab; the create-event modal is wide with one tab per start, add/remove, preserved values and invalid-tab navigation; both create and edit use the same tabbed editor. Updated [domains/events.md](domains/events.md), [domains/registrations.md](domains/registrations.md). Spec: `specs/ui-polish-2-ears.md`.

## [2026-11-08] ingest | UI-POLISH after MULTI-START user testing

Shipped the UI refinements from `Tasks/UI-POLISH/PRD.md`: event description shows per-start blocks (vertical with a map, horizontal without) with read-only computed distance; the create form puts the name first and links the nakarte.me hint; administrator registration exposes start selection before choosing a participant; test seeding requires a start and creates enrollments; `GET /events` now carries ordered `starts[]`, and the main-page upcoming widget expands multi-start events. Updated [domains/events.md](domains/events.md), [domains/registrations.md](domains/registrations.md). Spec: `specs/ui-polish-ears.md`.

## [2026-11-08] ingest | MULTI-START contracts shipped (T1–T12)

Compiled the implemented MULTI-START surface into the wiki. Events now persist `starts[]` as SoT (create requires ≥ 1; PATCH omit/`[]`/full-set, AD-7 lock, AD-8 projection). Registrations require `enrollments[]` on create and PATCH applies the desired `REGISTERED` set with Result-freeze and result-aware whole cancel. Authoritative results move to `PUT /events/:eventId/enrollments/:enrollmentId/result`; the registration-scoped route returns **410**; place is computed on read per gender × start × format. Category finish requires `startId`. Mutating routes honour Postgres-backed `Idempotency-Key`. Updated [domains/events.md](domains/events.md), [domains/registrations.md](domains/registrations.md), [domains/results.md](domains/results.md). Spec: `specs/multi-start-ears.md`; architecture: `Tasks/MULTI-START/ARCHITECTURE.md`.

## [2026-11-07] query | MULTI-START T2 review follow-up + AD-8

Human T2 parser review accepted. Live registration PATCH gated: reject `enrollments` and empty bodies until T6 (`assertSupportedRegistrationUpdate`). Recorded architecture **AD-8** (project EventLap/EventFormat from lowest-`sortOrder` start during T3–T6; no union). Updated [domains/events.md](domains/events.md), [domains/registrations.md](domains/registrations.md); Wave 9 unblocked in `.planning/STATE.md`.

## [2026-11-04] query | Policy deadlines vs 152-FZ

Audited all numeric deadlines in PolicyPage legal copy. None exceed statutory maxima. Filed [concepts/policy-deadlines-152fz.md](concepts/policy-deadlines-152fz.md); linked from INDEX, overview, personal-consent.

## [2026-11-04] ingest | Remove stray RifaStore policy.md

Deleted root `policy.md` (foreign RifaStore template with https://rifastore.ru). Operator email SoT remains `racing_manager_front/src/pages/PolicyPage/operator.ts` (`vse.na.gonku@gmail.com`). Wiki citations retargeted to PolicyPage. Updated [personal-consent](entities/personal-consent.md), [overview](overview.md), [SCHEMA](SCHEMA.md), [raw/sources](raw/sources.md).

## [2026-11-03] ingest | Consent email on registration events

Registration-sourced personal consent events store IdP `email` snapshot; first registration without usable email is refused; returning login does not rewrite consent-event email. Updated [domains/personal.md](domains/personal.md). Spec: `specs/consent-email-ears.md`.

## [2026-11-03] ingest | Authentik enrollment attribute checklist

Documented how to add a new enrollment attribute (Prompt + `consent` scope mapping + `default-source-enrollment-prompt` + write policy `add-registration-data-to-attributes`) in [infra/AUTHENTIK.md](../infra/AUTHENTIK.md). Root cause of missing `distribution_consent` grants was a write-policy gap, not the Nest path.

## [2026-11-03] ingest | Distribution consent from IdP on registration

First registration now records `PERSONAL_DATA_DISTRIBUTION_CONSENT` when Authentik claim `distribution_consent` is granted (mirror of `consent` → `PERSONAL_DATA_CONSENT`). Updated [domains/personal.md](domains/personal.md). Spec: `specs/distribution-consent-ears.md`; PRD: `Tasks/DIST-CONSENT/PRD.md`.

## [2026-11-03] ingest | EARS binds PRD to wiki (no SYSTEM.md)

Chose not to add a system-analysis stage. Strengthened `spec-kit-ears`: read accepted PRD + domain wiki, derive EARS from FR/UC, require bidirectional traceability, fill PRD Traceability EARS column. Updated [concepts/agent-workflow.md](concepts/agent-workflow.md).

## [2026-11-03] ingest | Functional analysis before EARS

Wired kit skill `functional-analysis`: English `Tasks/<KEY>/PRD.md` (problem, actors, use cases, FRs) is mandatory before `spec-kit-ears`. Updated kit router (`AGENTS.md`, `CLAUDE.md`, README), EARS/architecture inputs, and [concepts/agent-workflow.md](concepts/agent-workflow.md).

## [2026-11-03] ingest | Initial codebase compilation

Seeded Karpathy-style wiki under `docs/`: SCHEMA, raw catalog, overview, packages, entities, concepts, domains, INDEX. Wired root `AGENTS.md` and `.cursor/rules/project-knowledge.mdc`. Sources: package READMEs, Prisma schema enums/models, Nest controllers, front layout, infra docs pointers.
