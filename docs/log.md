# Wiki log

Append-only. Prefix every entry with `## [YYYY-MM-DD] ingest|query|lint | Title`.

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
