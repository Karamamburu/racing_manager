---
type: domain
updated: 2026-11-03
---

# Domain: events

## Responsibility

Event catalog, admin CRUD, formats, status sync, category finish, cancel/delete.

## Public contracts

- `GET /events`, `GET /events/:id` (catalog)
- `admin/events` — POST, PATCH, PATCH status, categories/finish, cancel, DELETE
- `GET /participation-formats`
- Related entities: [Event](../entities/event.md), [Track](../entities/track.md)

## Code

- API: `racing_manager_back/src/events/`
- Front: `features/events`, `pages/EventPage`, `pages/CalendarPage`

## Breakage signals

- Event response fields renamed/removed or status codes changed.
- `EventStatus` / `SportType` / `EventKind` enum values changed without migration.
- Registration window or format attachment semantics changed.
- Applied Prisma/SQL migration edited in place.
