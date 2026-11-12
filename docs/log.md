# Wiki log

Append-only. Prefix every entry with `## [YYYY-MM-DD] ingest|query|lint | Title`.

## [2026-11-12] ingest | AGE-CATEGORY-UX: participant total in tab headings

Each dialog tab heading now reads «{number} Категория - {count}», where the count is the sum of that category's member-group participants and is rendered in bold; an empty category shows `0`. Category and protocol headings stay «Категория {number}». Updated [domains/events.md](domains/events.md).

## [2026-11-11] ingest | AGE-CATEGORY-UX: populated-group picker and reset

The «Возрастные категории» dialog is now a draft editor of populated groups: the «Разбить по возрасту» switch is gone, «Сброс категорий» clears the draft to one empty «Категория 1» and stores nothing, and «Сохранить» on a draft with no selected group sends `enabled: false` with no categories and removes the stored configuration — the only disable path. The picker offers only groups with at least one participant plus groups selected in the draft (even at 0), labelled `{count} - {official name} ({display range})` with the nine official combined FLGR names, both «Юниоры и юниорки» bands separated by range, and a checked/disabled option with no owner hint for a group held by another tab. «Добавить категорию» is unavailable while every populated group is assigned and when none is populated. Counts cover the full protocol category (gender × start × format), ignore protocol search and city/team filters, exclude withdrawn rows and draft state, and count one per active row; unusable birth years belong to no group. `EventParticipant.ageGroupId` is additive on every protocol row (nine ids or `null`) under the unchanged season/control-year rule, for split, suppressed, unsplit and legacy protocols; protocol rendering, places and finishes are unchanged. Updated [domains/events.md](domains/events.md). Spec: [specs/age-category-ux-ears.md](../specs/age-category-ux-ears.md); PRD: [Tasks/AGE-CATEGORY-UX/PRD.md](../Tasks/AGE-CATEGORY-UX/PRD.md).

## [2026-11-11] ingest | AGE-CATEGORIES: shorter headings and a footer add action

Category headings read «Категория N» in the dialog tabs and the protocol sections. A group owned by another tab is shown disabled without the «входит в …» hint. «Добавить категорию» moved to the left side of the modal footer and uses the default button style, on one line with «Отмена» and «Сохранить». Updated [domains/events.md](domains/events.md).

## [2026-11-10] ingest | AGE-CATEGORIES: arbitrary age categories inside protocol categories

Replaced the fixed preset split with custom age categories inside a protocol category. The dialog «Возрастные категории» has one tab per category with «Добавить категорию», a remove action per tab, and groups owned by another tab shown disabled; up to nine categories of 1–9 groups, a group in at most one category, empty tabs dropped on save without consuming a number, and adding blocked while all nine groups are assigned. The route keeps its path `PUT /admin/events/:id/categories/age-split` with `ADMINISTRATOR` + `ORGANIZER` and `Idempotency-Key`, but the body is `{ gender, startId, formatId, enabled, categories: [{ groupIds }] }` with no category ids; `sections[]`, `kind` and preset payloads now answer 400. Read model: `EventDetails.ageSplits[]` carries `enabled` and ordered `categories[]` (`id` `CATEGORY_1`…`CATEGORY_9`, `number`, `title` «Возрастная категория N», range `subtitle`, `groupIds[]`), rows carry `sectionId` (`CATEGORY_n`, `REMAINDER`, `NO_BIRTH_YEAR`, `CATEGORY` when unsplit) and `place` is category-scoped; protocol order follows the youngest member group. Legacy `age_split_sections` rows are converted on read in `sort_order` into one category per row, nothing is rewritten until the next save, unknown ids are ignored, and a set that converts to nothing reads as disabled; new storage is `age_split_categories`. Updated [domains/events.md](domains/events.md), [domains/results.md](domains/results.md). Spec: [specs/age-categories-ears.md](../specs/age-categories-ears.md); PRD: [Tasks/AGE-CATEGORIES/PRD.md](../Tasks/AGE-CATEGORIES/PRD.md).

## [2026-11-10] ingest | AGE-SPLIT: age-group split inside protocol categories

Shipped the age split («Возрастное деление») inside a protocol category. Write surface: `PUT /admin/events/:id/categories/age-split` for `ADMINISTRATOR` + `ORGANIZER`, whole-set atomic replacement honouring `Idempotency-Key`, 400 for an empty enabled set, a duplicate or unknown id, or a category not on the event, 403 for other roles, and a disable that removes the stored set. Read surface is additive: `EventDetails.ageSplits?` (`enabled` plus ordered `sections[]` with `id` / `kind` / `title`) and `EventParticipant.sectionId`, with `place` recomputed inside the row's section — implicit ids `CATEGORY`, `REMAINDER`, `NO_BIRTH_YEAR`. Nine base groups (`AGE_LE_14` … `AGE_61_PLUS`) and two stored presets (`PRESET_JUNIOR_UNDER_24`, `PRESET_MASTERS_41_PLUS`) plus request-only `PRESET_ALL_GROUPS`; a preset absorbs individually selected member groups. Age comes from a 1 July – 30 June season whose `controlYear` is derived from the event date in `Europe/Moscow`. Section places are computed on read; stored `Result.place` snapshots stay untouched. Category finish keeps one action per gender × start × format. A class competition keeps the stored split suppressed until the bracket is removed; legacy events without starts are excluded. Updated [domains/events.md](domains/events.md), [domains/results.md](domains/results.md). Spec: `specs/age-split-ears.md`; PRD: `Tasks/AGE-SPLIT/PRD.md`.

## [2026-11-09] ingest | Protocol participant search and city/team filters

Event protocol rows can be searched by participant name and filtered by distinct city/team values present in the loaded `event.registrations`. Filtering stays client-side, combines AND across controls and OR within each multi-select, hides empty groups/tabs, keeps category actions on the full row set, and keeps expanded protocol sections open across filter resets. Spec: `specs/protocol-search-ears.md`. Updated [domains/events.md](domains/events.md).

## [2026-11-09] ingest | Functional analysis as a two-model pipeline

Converted `functional-analysis-v2` into an author/reviewer pipeline: DeepSeek V4.1 Flash writes the PRD, Gemini 4 Argon reviews it read-only with P0/P1/P2 findings, and any P0/P1 returns the PRD for rework for at most three rounds. Added role files, handoff templates, model slots, and validator support in `verify_handoff.mjs` plus `verify_prd_coverage.mjs`. Updated the kit router, EARS/architecture inputs, prompts, and [concepts/agent-workflow.md](concepts/agent-workflow.md).

## [2026-11-08] ingest | PR readiness: event UI and CMS fixes

Compiled the final pre-PR changes. [domains/events.md](domains/events.md) now records the horizontal characteristics layout, the “Положение о мероприятии” card, the stretching map, hidden event type, the “Тип старта” label, the “Например, Тушино” placeholder and the nakarte colour hint. [domains/cms.md](domains/cms.md) records standalone-final mass starts (including auto-seeding on first time entry), plan rewiring after a `COMPLETED` stage, and the preserved removal/heats protections. The UUID row-lock casts and parent registration sum are internal/UI fixes with no further contract change.

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

## 2026-11-12 — START-CATEGORY-BRACKETS

Shipped multi-stage races scoped to one start and one displayed age section. A race is identified by `event × start × format × gender × frozen target membership` (whole `CATEGORY`, exact base-group set, `REMAINDER`, or `NO_BIRTH_YEAR`), never by a positional `CATEGORY_n`. The field is captured once from the race's own start; configuration saves never move a row into or out of a race. Several races coexist in one protocol category; a `CATEGORY` race is allowed only when unsplit and alone. Protocol rows gained additive `raceId` / `raceRole`; a section race suppresses nothing, while a whole-category race suppresses the split. Ordinary result entry is blocked only for rows displayed in a race section; race heat times write to the race start's enrollment; start numbers are event-wide read-only while a participant appears in any race section. «Завершить гонку» stays per start × format × gender and treats a `DONE` race as complete. Existing races backfill to the single/first start + `CATEGORY`; the migration is idempotent and reports anomalies. Updated [domains/cms.md](domains/cms.md), [domains/events.md](domains/events.md), [domains/results.md](domains/results.md), [entities/class-competition.md](entities/class-competition.md), [packages/cms.md](packages/cms.md). Spec: `specs/start-category-brackets-ears.md`; PRD: `Tasks/START-CATEGORY-BRACKETS/PRD.md`.

## 2026-11-12 — CATEGORY-SELF-CONTAINED

The event protocol now renders each displayed section as one self-contained block: header (title, range subtitle, count, race marker), creation action in the header of an eligible simple block, race panel under the header, and the section's own final protocol table. The shared «Итоговый протокол» collapse is removed. «Возрастные категории», «Завершить гонку» and the compact/full control stay once above the blocks of each protocol category. No API, schema, stored value, place, result, finish or race behaviour changed. Updated [domains/events.md](domains/events.md). Spec: `specs/category-self-contained-ears.md`; PRD: `Tasks/CATEGORY-SELF-CONTAINED/PRD.md`.

## 2026-11-12 — CATEGORY-COLLAPSE

Each self-contained category block in the event protocol now has a header collapse control. Collapsing hides the block's race panel and protocol table while the header, title, range, count, race marker, creation action and category-wide controls stay visible; expanding restores the block. This makes a finished or idle category easier to fold away. Presentation-only; no API, schema or domain behavior changed. Updated [domains/events.md](domains/events.md).
