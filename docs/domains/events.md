---
type: domain
updated: 2026-11-08
---

# Domain: events

## Responsibility

Event catalog, admin CRUD, starts configuration, status sync, category finish, cancel/delete.

## Public contracts

- `GET /events`, `GET /events/:id` (catalog/details; both include `starts[]` with the same `EventStartRef` shape, ordered by `sortOrder`; details also include `registrations[]` protocol rows and `finishedCategories[]`)
- `POST /admin/events` — `CreateEventDto` with required `starts[]` (length ≥ 1); server generates each `startId`
- `PATCH /admin/events/:id` — omit `starts` → unchanged; `starts: []` → 400; present array → full desired set, applied atomically
- `POST /admin/events/:id/categories/finish` — body includes required `startId`; uniqueness is `(eventId, startId, formatId, gender)`
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

- Event page “Описание” renders one block per start (label, purpose, formats, laps, total distance). With a map link the blocks stack vertically; without a map they flow horizontally and wrap. A legacy distance override is shown as the total distance with a marker.
- Formats live inside their start block; there is no event-level “Форматы участия” row. For an eligible authenticated athlete each start format is a one-click registration control carrying `startId` + `formatId`; ineligible viewers see tags.
- The one-click pre-confirmation names the event, the start label, and the format; the success confirmation names the same start and format. The full registration dialog lists every selected start in its success confirmation.
- The create-event form places the event “Название” after the disabled track field. The create modal is wide; starts are edited in tabs (one per start), with add/remove, preserved tab values, and invalid-tab navigation. The per-start “Название” is the first field inside each tab.
- The map-link field shows “Скопируйте ссылку на трек с nakarte.me. Необязательно.” with `nakarte.me` opening the site in a new tab.
- The start editor shows “Дистанция” as read-only computed text (`lapCount × lapLengthMeters`, or the legacy override). Distance is never submitted as an input; changing laps or lap length recalculates it. Starts with enrollments keep laps, purpose, and distance read-only.
- The main-page “Ближайшие события” widget expands events with more than one start and lists every start (label, purpose, distance) in `sortOrder`; single-start events stay compact.

## Protocol rows

`registrations[]` carries one row per active enrollment: `enrollmentId`, `startId`, `startLabel`, `sortOrder`, `enrollmentStatus`, `outcome`, `finishTimeMs`, computed `place`, `isCupEligible`. Place is computed on read per gender × start × format; WITHDRAWN enrollments are omitted.

## Code

- API: `racing_manager_back/src/events/`, `src/results/`, `src/idempotency/`, `src/migrations/`
- Front: `features/events`, `pages/EventPage`, `pages/CalendarPage`

## Breakage signals

- Event response fields renamed/removed or status codes changed.
- `EventStatus` / `SportType` / `EventKind` enum values changed without migration.
- Registration window or format attachment semantics changed.
- Applied Prisma/SQL migration edited in place.
- Dual writable SoT: event-level `laps`/`formatIds` written alongside `starts[]`.
- Category finish without `startId` or place treated as stored SoT.
