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
- `PUT /admin/events/:id/categories/age-split` — `ADMINISTRATOR` + `ORGANIZER`; body `SetAgeCategoriesDto` (`gender`, `startId`, `formatId`, `enabled`, `categories[]` of `{ groupIds }`, no category ids); replaces that protocol category's whole age-category set atomically, honours `Idempotency-Key` and returns `AgeSplitRef`. 400 for a retired `sections[]`, any `kind` field or preset id, an empty enabled set, a group in two categories or twice in one, an unknown group, or a category not on the event; 403 for any other role. `enabled: false` with an empty `categories` removes the stored set; age categories sent while off are rejected.
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

`ageSplits?: AgeSplitRef[]` adds the stored configuration per protocol category: `enabled` plus the ordered `categories[]`, each with `id` (`CATEGORY_1`…`CATEGORY_9`), `number`, `title` («Возрастная категория N»), `subtitle` (member ranges such as `15–16, 17–18`) and `groupIds[]`. Every row carries `sectionId`: `CATEGORY_n` for a configured age category, `REMAINDER` or `NO_BIRTH_YEAR` for the implicit ones, and `CATEGORY` when the protocol category is unsplit. `place` is age-category-scoped when the category is configured and keeps today's category-wide value otherwise.

## Age categories (AGE-CATEGORIES)

A protocol category (`event × gender × start × format`) may carry one **age-category configuration** (UI: «Возрастные категории»): an ordered list of custom age categories that partitions that category's rows for display. It is presentation and classification only — never a registration, enrollment, result or finish mutation.

- Nine base groups with inclusive bands: `AGE_LE_14` (≤14), `AGE_15_16` (15–16), `AGE_17_18` (17–18), `AGE_19_20` (19–20), `AGE_21_23` (21–23), `AGE_24_40` (24–40), `AGE_41_50` (41–50), `AGE_51_60` (51–60), `AGE_61_PLUS` (61+). Labels follow the FLGR vocabulary per gender (`Юноши` / `Девушки` младшего, среднего and старшего возраста, `Юниоры` / `Юниорки`, `Мужчины` / `Женщины`, `Мастер 1`–`Мастер 3`).
- 1–9 custom age categories, each holding 1–9 base groups; a group belongs to at most one age category of that protocol category. Membership is explicit — any grouping is valid, including non-adjacent bands. The three fixed presets (`PRESET_JUNIOR_UNDER_24`, `PRESET_MASTERS_41_PLUS`, `PRESET_ALL_GROUPS`) are gone from the dialog and the write contract.
- Dialog: one tab per configured category in configuration order, or one empty «Возрастная категория 1» when nothing is stored; «Добавить категорию» appends an empty tab on the right, each tab has a remove action, and a group owned by another tab is listed disabled with that tab's heading. Adding is blocked while all nine groups are assigned and is available again as soon as one is released; the last tab may be removed (no tabs, add still available). Selecting a group turns the configuration on; closing without saving changes nothing. A saved tab with no groups is dropped and does not consume a number.
- Numbering is configuration order, resequenced on tab removal and on dropped empty tabs; membership edits, order-preserving saves and the age-based protocol order never renumber. The read-model id is `CATEGORY_{number}`, derived from stored position on every read, used as the row `sectionId`, and never sent by a client. Titles are the automatic «Возрастная категория N» plus a range subtitle in ascending age order.
- Protocol order is by the youngest member group (bounds 0/15/17/19/21/24/41/51/61), then «Остальные участники» (`REMAINDER`), then «Возраст не указан» (`NO_BIRTH_YEAR`); remainder and no-birth-year stay implicit and always exist. A category with no displayed rows (empty, or fully filtered out) is not rendered. Numbers and protocol order are independent.
- Age rule: the season runs 1 July – 30 June; `controlYear` is the calendar year the season ends in, derived from the event date in `Europe/Moscow`; age = `controlYear − birthYear`. A null birth year, or one later than `controlYear`, is unusable and lands in «Возраст не указан»; a usable participant whose base group is in no age category lands in «Остальные участники».
- Places restart inside every age category (and inside `REMAINDER` / `NO_BIRTH_YEAR`) with today's rules; see [results.md](results.md).
- «Завершить гонку» stays one action per gender × start × format over the full category row set, and the configuration adds no age dimension to its uniqueness. Changes are allowed before results, after results and after the finish: only displayed places are recomputed, while the finish tag, row-editing lock and stored `Result.place` snapshots stay as they are. One «Итоговый протокол» collapse and one compact/full toggle stay per protocol category.
- A category owned by a class competition keeps the stored configuration but is rendered unsplit while the bracket exists; it applies on the next read after the bracket is removed. The dialog states that the stored configuration is not applied meanwhile.
- Only administrators and organizers get the control; other viewers receive the configuration read-only. The control is offered only for a protocol category with at least one row: a configuration retained on a temporarily empty category is not applied and comes back with the rows.
- Legacy events without starts keep the gender → format protocol, receive no `ageSplits` and cannot be configured.
- The response is additive and backward compatible: a client that ignores `sectionId` and `ageSplits` renders as before; an unsplit category reports `enabled: false`, an empty `categories` array and `CATEGORY` on every row.

## Age-category conversion

- Stored legacy `age_split_sections` rows are still read as input: each row (`BASE_GROUP` or `PRESET`), taken in `sort_order`, becomes one age category holding that group or preset's member groups, numbered in that same order. The row partition, section order and places the old setting produced are preserved; headings follow the new numbering.
- Nothing is rewritten on read. The legacy rows are cleared only by the next successful save for that protocol category, which writes the new `age_split_categories` rows. A category that has new-model rows reads those and ignores legacy rows.
- Unknown legacy ids are ignored; a set that converts to no age category reads as disabled (one list, category-wide places).

## Protocol search and filters

- The “Зарегистрированные участники” card shows a toolbar above the gender groups: a search input on the “Участник” column (`EventParticipant.fullName`, case-insensitive substring, `ё` treated as `е`) and multi-select filters “Город” and “Команда”.
- Filter options are the distinct trimmed non-empty `EventParticipant.city` / `EventParticipant.team` values from the loaded `event.registrations`, de-duplicated case-insensitively and sorted in Russian locale order.
- Controls combine with AND across columns and OR within one multi-select. Groups, tabs, and sections without matching rows are hidden; their counters show matched rows.
- Filtering is client-side only; no HTTP contract changes. An empty result keeps the toolbar and selections and shows “Участники не найдены” with a reset action. Reset restores every row and keeps previously expanded “Итоговый протокол” sections expanded.
- Category actions (“Завершить гонку”, class-competition panel, result and registration-status editing) still evaluate against the full category row set, not the filtered subset.

## Code

- API: `racing_manager_back/src/events/`, `src/results/`, `src/idempotency/`, `src/migrations/`
  - Age categories: `age-groups.ts` (group catalog, age rule, normalization, `CATEGORY_{number}` ids, titles/subtitles, protocol order, legacy conversion), `age-split.service.ts` (submission validation, atomic replacement), `age-split.repository.ts` (new rows plus legacy fallback), `parse-set-age-split.ts` (`SetAgeCategoriesDto`; the legacy `sections[]` parser is retained for stored rows), `age-split.controller.ts`
- Front: `features/events`, `pages/EventPage`, `pages/CalendarPage`
  - Age categories: `features/events/ageCategories.ts` (group catalog, titles, subtitles, age ordering), `features/events/protocolGroups.ts` (partition into age categories and implicit sections), `pages/EventPage/components/AgeSplitModal.tsx` (tabbed configuration dialog)
- SQL: `racing_manager_db/db/migrate_age_categories_2026_11_10.sql` — `age_split_categories` keyed `(eventId, startId, formatId, gender, categoryNumber, groupId)` with a unique group per protocol category; `racing_manager_db/db/migrate_age_split_2026_11_10.sql` — the legacy `age_split_sections` table, now read-only conversion input

## Breakage signals

- Event response fields renamed/removed or status codes changed.
- `EventStatus` / `SportType` / `EventKind` enum values changed without migration.
- Registration window or format attachment semantics changed.
- Applied Prisma/SQL migration edited in place.
- Dual writable SoT: event-level `laps`/`formatIds` written alongside `starts[]`.
- Category finish without `startId` or place treated as stored SoT.
- `CATEGORY_{number}` numbering drifting from configuration order (it is the identity of a read-model slot; titles are display text only).
- Preset ids or `sections[]` accepted again on the configuration route.
- A base group stored in two age categories of one protocol category.
- Legacy `age_split_sections` rows rewritten during read instead of by the next save.
- `place` becoming a stored snapshot for configured categories.
- An age-category mutation touching registrations, enrollments, results or category finishes.
- Finish uniqueness gaining an age dimension.
- The configuration applied while a class competition exists for the category.
- A base group silently dropped from the protocol (a row rendered twice or not at all).
- A new required response field breaking clients that ignore `sectionId` / `ageSplits`.
