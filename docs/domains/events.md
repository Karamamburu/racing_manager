---
type: domain
updated: 2026-11-07
---

# Domain: events

## Responsibility

Event catalog, admin CRUD, formats, status sync, category finish, cancel/delete.

## Public contracts

- `GET /events`, `GET /events/:id` (catalog)
- `admin/events` — POST, PATCH, PATCH status, categories/finish, cancel, DELETE
- `GET /participation-formats`
- Related entities: [Event](../entities/event.md), [Track](../entities/track.md)

## MULTI-START transition (AD-8)

Until enrollment-scoped ranking (T7), portal writable SoT for race offerings is `starts[]` when present. Legacy `EventLap` / `EventFormat` stay for ranking/CMS and are **projected from the start with the lowest `sortOrder`** after each starts apply. Do not union sibling starts into one event grid. Multi-start may exist; non-primary starts are incomplete for legacy ranking in that window. Spec: `specs/multi-start-ears.md`; architecture AD-8.

## Code

- API: `racing_manager_back/src/events/`
- Front: `features/events`, `pages/EventPage`, `pages/CalendarPage`

## Breakage signals

- Event response fields renamed/removed or status codes changed.
- `EventStatus` / `SportType` / `EventKind` enum values changed without migration.
- Registration window or format attachment semantics changed.
- Applied Prisma/SQL migration edited in place.
- Dual writable SoT: event-level `laps`/`formatIds` written alongside `starts[]`.
