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

## 2026-11-12 — START-CATEGORY-BRACKETS legacy unique index fix

A second multi-stage race in the same start but a different age section failed with 409 «уже создана». The database still carried Prisma's legacy unique index `class_competitions_event_format_gender_key` on `(event_id, format_id, gender)`, while the scoped identity index allows one race per `(event, start, format, gender, target_key)`. Added `db/migrate_start_category_brackets_2026_11_12_drop_legacy_unique.sql` (and its down file) and included both legacy index names in the original migration's drop step.

## [2026-11-13] ingest | MANUAL-TIMING live timing and lap splits

Implemented the manual timing service for concurrent protocol categories. A global `REFEREE` role (or `ADMINISTRATOR`) opens one event-wide surface, starts each category, captures passes by event-unique number or tile, binds pending finishes and closes attempts; `ORGANIZER` alone has no timing. The attempt is `event × start × format × gender × attempt number`; N is the start lap count; raw captures are immutable and official times are correctable with a reason and an audit row. One event-wide capture lock has no automatic lease. A closure atomically publishes each participant-at-N's authoritative enrollment `FINISHED` result with exactly N lap splits into `result_splits` (`Result.timing_session_id` provenance); manual result upserts clear stale splits, and protocol rows expose additive `lapSplits` while legacy `laps` stays unchanged. Race-section rows are excluded, start numbers are locked during a running attempt, and race creation is refused when it would capture a running-attempt participant. Schema: `racing_manager_db/db/migrate_manual_timing_2026_11_13.sql` and `migrate_referee_role_2026_11_13.sql`. Updated [domains/timing.md](domains/timing.md) (new), [domains/results.md](domains/results.md), [domains/events.md](domains/events.md), [domains/cms.md](domains/cms.md), [domains/registrations.md](domains/registrations.md), [entities/timing-session.md](entities/timing-session.md) (new), [entities/user-and-roles.md](entities/user-and-roles.md), [entities/registration.md](entities/registration.md), [INDEX.md](INDEX.md). Spec: `specs/manual-timing-ears.md`; PRD: `Tasks/MANUAL-TIMING/PRD.md`; architecture: `Tasks/MANUAL-TIMING/ARCHITECTURE.md`.

## 2026-11-14 — MANUAL-TIMING-2

Added anonymous Enter splits with a fixed top queue and number assignment/cancellation, per-heat timing attempts for multi-stage races that publish only `ClassHeatTime` total + `OK`, a per-attempt closure gate with rejected receipts, a 100 ms local elapsed display, and independent per-block protocol collapse. A heat attempt is `event + race + stage + heat + attempt number`; it shares the capture lock/epoch/mark model, keeps the category `RACE_SECTION` exclusion, and never advances or qualifies a stage. Existing manual heat-time form, stage seeding/reassignment/removal and stage commitment stay with ORGANIZER/ADMINISTRATOR; the timing surface stays REFEREE/ADMINISTRATOR. Updated [domains/timing.md](domains/timing.md), [domains/results.md](domains/results.md), [domains/cms.md](domains/cms.md), [domains/events.md](domains/events.md), [entities/timing-session.md](entities/timing-session.md). Spec: `specs/manual-timing-2-ears.md`; PRD: `Tasks/MANUAL-TIMING-2/PRD.md`; architecture: `Tasks/MANUAL-TIMING-2/ARCHITECTURE.md`.

## 2026-11-14 — MANUAL-TIMING-2 capture retention and closure gaps

A category closure no longer releases the event-wide capture lock: the workstation that timed one category keeps the hold for the next one, and releasing stays explicit (`force-release`/`transfer`). A capture refused by the capture-lock or clock-epoch check now writes a `REJECTED` receipt for its issued sequence instead of leaving a gap that later blocks closure with `UNCONFIRMED_MUTATIONS`; closure-gate messages are Russian. The anonymous split queue renders as two columns and the number field focuses itself in assignment mode without the attempt caption; the elapsed time cell has a fixed width and tabular digits. Updated [domains/timing.md](domains/timing.md).

## 2026-11-14 — timing UI density and protocol splits

The timing page now keeps the capture controls, current-block selector and number field in the left column of the top control block and the anonymous split queue in its right column with a shorter fixed area. Every category and heat block collapses independently while its header, state tag and actions stay visible. Participant tiles are compact and filled with the colour of their state, so more tiles fit on screen. In the event protocol the «Отсечки» column renders every split as `hh:mm:ss.mmm` and stacks the lap time over the cumulative time. No API or stored value changed. Updated [domains/timing.md](domains/timing.md).

## 2026-11-14 — protocol split columns

The «Отсечки» column of the event protocol lays laps side by side: each lap reads `N - lap time` with the cumulative time directly under the lap time, and laps wrap inside the column when they no longer fit. Times stay `hh:mm:ss.mmm`. Presentation-only.

## 2026-11-14 — timing number field

The top control block of the timing page is three symmetric columns: capture controls and current-block selector, a large square number field in the middle, and the anonymous split queue on the right. The number field is 132×132 px with 48 px centred digits, so it is easy to hit and the typed number is readable at a glance. Presentation-only.

## 2026-11-14 — full-height timing controls

The three columns of the timing top block now share its full height. The number field doubles to 264×264 px with 96 px centred digits, and the anonymous split queue stretches with its column instead of keeping a fixed 104 px area (104 px stays as the minimum). Presentation-only.

## 2026-11-14 — MANUAL-TIMING-3 block-free splits

Anonymous splits are now event-scoped: Enter queues one with no current block, the attempts running at the press are frozen as candidates, and assignment is by participant number only. The number resolves event-wide and then inside the candidates; an accepted assignment creates the pass at the captured instant in the chosen attempt, while an ambiguous number asks for an explicit choice and a non-qualifying one names every reason. The «Текущий блок» selector is removed. Closure gates every still-running candidate; legacy queued splits stay bound to their captured attempt. Added `timing_event_splits`, `timing_anonymous_split_candidates`, `timing_event_capture_receipts`, `timing_event_audit`, receipt origin and split-provenance columns; see `migrate_manual_timing_3_2026_11_14.sql` (+ down). Updated [domains/timing.md](domains/timing.md).

## 2026-11-14 — split sequence provenance guard

A split-derived pass must not borrow the assignment's event sequence as its attempt capture sequence: a closure that counted marks as capture evidence then demanded receipts for those numbers. The closure coverage now ignores split provenance, and SQL normalises existing split-derived marks to `device_sequence = NULL` and adds `timing_marks_split_capture_sequence_check` (`source_split_id IS NULL OR device_sequence IS NULL`), so a stale reader cannot reproduce the false gap. See `migrate_manual_timing_3_2026_11_14_split_sequence_guard.sql`.

## 2026-11-14 — timing totals in a multi-stage stage panel

A timing heat closure writes one total and no per-lap rows. The stage panel treated a multi-lap slot as incomplete unless every event lap had a row, so the timing total was invisible and «Зафиксировать этап» never appeared. A slot with status `OK` and a total is now filled regardless of per-lap detail; the starter card shows the timing total as «Итог» beside the optional lap rows.

## 2026-11-14 — heat lap times from timing

A heat closure now publishes one `ClassHeatLapTime` per event lap from the attempt's official-instant splits, in addition to the `ClassHeatTime` total + `OK`. The stage panel therefore shows Круг 1, Круг 2 and Итог for every participant; a total-only heat remains a complete slot. Existing timing heat times for the current event were backfilled from their bound marks.

## 2026-11-15 — Russian timing errors

All timing domain refusals and timing request-validation messages are now Russian and written for a referee: missing number, wrong attempt, capture holder, closure gates, ambiguous split, sequence conflict, invalid request field. The frontend already displays the API message verbatim; no behavior or error code changed.

## 2026-11-15 — automatic DNS and DNF

Ordinary category completion now publishes `DNS` for a non-excluded participant with no captures and `DNF` for one with some captures but fewer than N; participants at N keep `FINISHED` with time and splits. Ordinary heat completion writes the same outcomes as `ClassHeatTime` rows (`OK`/total, `DNS`, `DNF`), so the stage panel and stage commitment no longer need a manual status for every non-finisher. Forced completion and cancellation keep their previous rules: force publishes only at-N participants, cancellation publishes nothing. No synthetic time or split is written for DNS/DNF.

## 2026-11-15 — legacy category-finish uniqueness removed

`category_finishes_event_class` still enforced one finished classification per `(event, gender, format)`, so finishing the same format+gender on a second start failed with a 500 unique violation. The stored model has been start-aware since MULTI-START via `uq_category_finishes_start (event_id, start_id, format_id, gender)`; the legacy index is now dropped in `migrate_multi_start_2026_11_15_drop_legacy_finish_unique.sql` and no longer created in `init.sql`.

## 2026-11-15 — timing page block order

The timing page now sorts category slots by state: `RUNNING` first, then `NOT_STARTED`, then every closed state last. Backend order is preserved inside one state, and heat blocks stay in place so stage-header grouping does not change. This keeps the referee's active category at the top and folds finished ones to the bottom of a long event.

## 2026-11-15 — timing page width by roster size

The timing page now places category groups in a wrapping row instead of one full-width stack. A group with up to 6 visible participant tiles takes a third of the row (three per line), 7–12 takes a half (two per line), and 13 or more takes the full width; the group is sized by its widest category or heat block, and race-section rows do not count. Participant tiles switched from viewport breakpoints to a card-width grid (`auto-fill`, 120 px minimum), so a narrow card keeps readable tiles. Below 1440 px a third falls back to a half and below 992 px every group is full width.

## 2026-11-15 — even timing rows

The timing grid now packs same-width categories into explicit rows: three thirds, two halves or one full card. Two cards always split the row exactly in half, and a lone half or third keeps its fraction instead of growing to the full width, which had made a 7-participant category look like a full-width block.

## 2026-11-15 — heats share their stage row

The timing layout now fills a partial row with the next card of the same state and width, so a full-width race between two 7–12-participant categories no longer leaves one of them orphaned on an empty half-row. A multi-stage race stays one full-width section, but each stage packs its heat cards by their own roster size: two 7–8-participant heats now sit side by side instead of stacking as full-width cards, while a 30-participant heat keeps the full width.

## 2026-11-15 — timing block completion cues

The timing surface now reports `capturesComplete` for a running block that holds exactly N bound passes for every non-excluded participant with no unbound finish, and `finished` for a finished protocol category or multi-stage race. The page shows the blue «Все отсечки в гонке данной категории получены, её можно завершить» cue once every capture is in, and paints the locked-results plate of a finished category green instead of the warning tone.

## 2026-11-15 — «отсечка» in the timing UI

Every user-facing label of the timing page now calls a block-free capture «отсечка»: the queue title and items, the cancel dialog and its actions, the number-field hints, busy labels, local refusals and the API refusal messages shown on the page. The API routes, stored tables and code identifiers keep the `split` naming.

## 2026-11-15 — Space captures an отсечка

The empty number field now treats Space exactly like Enter: both queue a block-free capture, both commit a typed number, and both refuse an empty assignment. The former «Пробел ничего не записывает» refusal and its hint are gone; the queue and field hints name Enter or Space. The timing EARS and both manual-timing PRDs were amended accordingly.

## 2026-11-15 — judge summary on the timing page

The top block now shows «Ход хронометража»: categories finished/total, participants finished/total, participants on course, blocks ready to complete, outstanding unassigned captures and unbound finishes, and remaining passes. The summary is computed from the loaded surface, adds no request, and excludes race-section duplicates and participants outside timing.

## 2026-11-15 — the timing record is a category record

The attempt record drawer is now titled «Запись категории» for a category block and «Запись заезда» for a heat. Inside the drawer the record itself is called «запись» («Запись отменена», «Запись закрыта», «Запись пуста», «ID записи»), and its closure actions read «Завершить хронометраж» / «Отменить хронометраж». The generic correction dialogs use the same «хронометраж» wording.
