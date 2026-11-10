---
type: domain
updated: 2026-11-10
---

# Domain: events

## Responsibility

Event catalog, admin CRUD, starts configuration, status sync, category finish, cancel/delete.

## Public contracts

- `GET /events`, `GET /events/:id` (catalog/details; both include `starts[]` ordered by `sortOrder`. Details use `EventStartRef`; catalog rows add per-start `registeredCount` and share `routeColor`. Details also include `registrations[]` protocol rows and `finishedCategories[]`)
- `POST /admin/events` — `CreateEventDto` with required `starts[]` (length ≥ 1); server generates each `startId`
- `PATCH /admin/events/:id` — omit `starts` → unchanged; `starts: []` → 400; present array → full desired set, applied atomically
- `POST /admin/events/:id/categories/finish` — body includes required `startId`; uniqueness is `(eventId, startId, formatId, gender)`
- `PUT /admin/events/:id/categories/age-split` — `ADMINISTRATOR` + `ORGANIZER`; body `SetAgeSplitDto` (`gender`, `startId`, `formatId`, `enabled`, `sections[]` of `{ kind: 'BASE_GROUP' | 'PRESET', id }`); replaces that category's whole section set atomically, honours `Idempotency-Key` and returns `AgeSplitRef`. 400 for an empty enabled set, a duplicate or unknown id, or a category not on the event; 403 for any other role. `enabled: false` removes the stored set.
- `GET /participation-formats`
- Related entities: [Event](../entities/event.md), [Track](../entities/track.md)

## Starts (MULTI-START)

- `StartInputDto`: optional `id` (omit = create; set = update on this event), `purposeType` (`CUP_RACE` | `CONTROL_TRAINING`), non-empty unique `formatIds`, positive `lapCount`, positive integer `lapLengthMeters`, optional `displayName`, unique non-negative `sortOrder`.
- `StartResponseDto` adds server-computed `resolvedLabel`, `legacyEffectiveDistanceM` and `displayedDistanceMeters`.
- Identity/labels: identical starts and colliding resolved labels (trim + case-insensitive) are rejected; blank `displayName` becomes auto-label `{purpose label} — {km} км`.
- Edit matrix: any enrollment (including `WITHDRAWN`) freezes delete, lap count/length, purpose and removal of a used format. Result-free starts may be edited/deleted while at least one start remains. `legacyEffectiveDistanceM` clears only on an allowed lap-configuration change.
- `EventLap` / `EventFormat` remain for ranking/CMS during the transition and are projected from the lowest-`sortOrder` start (AD-8); they are not a second writable SoT.
- Legacy cutover: exactly one start per legacy event, distance table + lifecycle mapping, anomaly report; re-run per `eventId` is idempotent (`npm run migrate:multi-start`).
- Idempotency: mutating admin routes honour `Idempotency-Key` (Postgres store, ≥ 24 h; same key + same payload replays, different payload → 409).

## UI surfaces (UI-POLISH)

- Event page “Старты” renders one block per start (label, purpose, formats, laps, total distance). With a map link the starts and “Карта трассы” cards share the upper row; the map keeps at least its base height and stretches with the starts card. Without a map the starts card is full width. The free-form event description is titled “Положение о мероприятии”, sits in a separate full-width card below, grows with its text (no fixed height or inner scroll), and its admin textarea auto-sizes.
- Event characteristics use a horizontal key–value layout (labels and values on the same row, wrapping only when needed).
- Each start may carry an optional `routeColor` from the fixed palette `BLUE` (119,119,255), `ORANGE` (255,153,85), `CYAN` (0,255,255), `RED` (255,119,119), `MAGENTA` (255,119,255), `YELLOW` (238,238,85). The start card header is tinted with that colour at 50% opacity; no colour keeps the default header. Colour is editable with enrollments and is presentation-only.
- Formats live inside their start block; there is no event-level “Форматы участия” row. For an eligible authenticated athlete each start format is a one-click registration control carrying `startId` + `formatId`; ineligible viewers see tags.
- The one-click pre-confirmation names the event, the start label, and the format; the success confirmation names the same start and format. The full registration dialog lists every selected start in its success confirmation.
- The create-event form places the event “Название” after the disabled track field. The create and edit modals share the same wide layout (1040 px, bounded scroll); starts are edited in tabs (one per start), with add/remove, preserved tab values, and invalid-tab navigation. The per-start “Название” is the first field inside each tab (placeholder “Например, Тушино”), followed by “Тип старта” (wire field `purposeType`).
- The event-type control is hidden in both create and edit forms but the existing/default `eventType` value remains in the submitted payload.
- The map-link field shows “Скопируйте ссылку на трек с nakarte.me. Необязательно.” with `nakarte.me` opening the site in a new tab.
- The route-colour selector carries the hint “Должен совпадать с цветом маршрута на nakarte.me”.
- The start editor shows “Дистанция” as read-only computed text (`lapCount × lapLengthMeters`, or the legacy override). Distance is never submitted as an input; changing laps or lap length recalculates it. Starts with enrollments keep laps, purpose, and distance read-only.
- The main-page “Ближайшие события” table renders every start as a child row under its event row, in `sortOrder` (including single-start events). Child rows show the start label in “Событие”, the start distance in “Дистанция”, and the `REGISTERED` enrollment count in “Зарегистрировано”; other cells are empty. The parent row leaves “Дистанция” empty; its “Зарегистрировано” value is the sum of the per-start `REGISTERED` counts (falling back to the event-level count only when no starts exist). Child rows are visible by default and collapse with the parent.

## Protocol rows

`registrations[]` carries one row per active enrollment: `enrollmentId`, `startId`, `startLabel`, `sortOrder`, `enrollmentStatus`, `outcome`, `finishTimeMs`, computed `place`, `isCupEligible`. Place is computed on read per gender × start × format; WITHDRAWN enrollments are omitted.

`ageSplits?: AgeSplitRef[]` adds the stored split per category (`enabled` plus the ordered `sections[]` with `id` / `kind` / `title`). Every row carries `sectionId`; `place` is section-scoped when the category is split and keeps today's category-wide value otherwise. Implicit section ids are `CATEGORY` (unsplit category), `REMAINDER` and `NO_BIRTH_YEAR`.

## Age split (AGE-SPLIT)

A protocol category (`event × gender × start × format`) may carry one age split («Возрастное деление»): a non-empty stored section set that partitions that category's rows for display. It is presentation and classification only — never a registration, enrollment, result or finish mutation.

- Nine base groups with inclusive bands: `AGE_LE_14` (≤14), `AGE_15_16` (15–16), `AGE_17_18` (17–18), `AGE_19_20` (19–20), `AGE_21_23` (21–23), `AGE_24_40` (24–40), `AGE_41_50` (41–50), `AGE_51_60` (51–60), `AGE_61_PLUS` (61+). Labels follow the FLGR vocabulary per gender (`Юниоры` / `Юниорки`, `Мужчины` / `Женщины`, `Мастер 1`–`Мастер 3`).
- Two stored combined presets: `PRESET_JUNIOR_UNDER_24` («Юниоры и младше (<24)», groups ≤14 through 21–23) and `PRESET_MASTERS_41_PLUS` («Мастера 41+», 41–50 through 61+). The request-only `PRESET_ALL_GROUPS` («Все возрастные группы») is never stored: it normalizes to the nine base sections and clears combined ones. A stored preset absorbs its member groups that were also selected individually.
- Age rule: the season runs 1 July – 30 June; `controlYear` is the calendar year the season ends in, derived from the event date in `Europe/Moscow`; age = `controlYear − birthYear`. A null birth year, or one later than `controlYear`, is unusable and lands in «Возраст не указан»; a usable participant whose base group is in no section lands in «Остальные участники».
- Section order is by youngest age bound (base groups 0/15/17/19/21/24/41/51/61; presets 0 and 41), then `REMAINDER`, then `NO_BIRTH_YEAR`. Base titles are `{gender label} ({range})`, presets use the preset title, and the implicit titles are «Остальные участники» and «Возраст не указан». A section with no displayed rows is not rendered.
- Category finish stays one action per gender × start × format over the full category row set, and the split adds no age dimension to its uniqueness. Changing the split is allowed before results, after results and after the finish: it recomputes displayed section places only and keeps the finish tag, row-editing lock and stored `Result.place` snapshots.
- A category owned by a class competition keeps the stored split but is rendered unsplit while the bracket exists; it applies on the next read after the bracket is removed.
- Legacy events without starts keep the gender → format protocol, receive no `ageSplits` and cannot be split.
- The response is additive and backward compatible: a client that ignores `sectionId` and `ageSplits` renders as before; an unsplit category reports `enabled: false`, empty `sections` and `CATEGORY` on every row.

## Protocol search and filters

- The “Зарегистрированные участники” card shows a toolbar above the gender groups: a search input on the “Участник” column (`EventParticipant.fullName`, case-insensitive substring, `ё` treated as `е`) and multi-select filters “Город” and “Команда”.
- Filter options are the distinct trimmed non-empty `EventParticipant.city` / `EventParticipant.team` values from the loaded `event.registrations`, de-duplicated case-insensitively and sorted in Russian locale order.
- Controls combine with AND across columns and OR within one multi-select. Groups, tabs, and sections without matching rows are hidden; their counters show matched rows.
- Filtering is client-side only; no HTTP contract changes. An empty result keeps the toolbar and selections and shows “Участники не найдены” with a reset action. Reset restores every row and keeps previously expanded “Итоговый протокол” sections expanded.
- Category actions (“Завершить гонку”, class-competition panel, result and registration-status editing) still evaluate against the full category row set, not the filtered subset.

## Code

- API: `racing_manager_back/src/events/`, `src/results/`, `src/idempotency/`, `src/migrations/`
  - Age split: `age-groups.ts` (catalog, age rule, section order/titles), `age-split.service.ts` (normalization, atomic replacement), `age-split.repository.ts`, `parse-set-age-split.ts` (body validation, `PRESET_ALL_GROUPS`), `age-split.controller.ts`
- Front: `features/events`, `pages/EventPage`, `pages/CalendarPage`
  - Age split: `features/events/protocolGroups.ts` (section partition), `pages/EventPage/components/AgeSplitModal.tsx` (control)
- SQL: `racing_manager_db/db/migrate_age_split_2026_11_10.sql` — `age_split_sections` table plus `age_split_section_kind` enum, keyed `(eventId, startId, formatId, gender, sectionId)` with a unique `sortOrder` per category

## Breakage signals

- Event response fields renamed/removed or status codes changed.
- `EventStatus` / `SportType` / `EventKind` enum values changed without migration.
- Registration window or format attachment semantics changed.
- Applied Prisma/SQL migration edited in place.
- Dual writable SoT: event-level `laps`/`formatIds` written alongside `starts[]`.
- Category finish without `startId` or place treated as stored SoT.
- An age section id or preset id renamed or removed (they are API identity; titles are display text only).
- `place` becoming a stored snapshot for split categories.
- A split mutation touching registrations, enrollments, results or category finishes.
- Finish uniqueness gaining an age dimension.
- The age split applied while a class competition exists for the category.
- A new required response field breaking clients that ignore `sectionId` / `ageSplits`.
