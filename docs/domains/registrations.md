---
type: domain
updated: 2026-11-03
---

# Domain: registrations

## Responsibility

Create/update/cancel registrations (self, guest, for-user); status transitions; uniqueness rules.

## Public contracts

- `POST/GET/PATCH …/events/:eventId/registrations/*` (incl. guest, for-user, cancel, status)
- Entity: [Registration](../entities/registration.md)

## Code

- API: `racing_manager_back/src/registrations/`
- Front: `features/registrations`, EventPage register modals

## Breakage signals

- Registration status enum or uniqueness indexes changed.
- Guest vs user payload fields renamed/removed.
- Consent gates on register changed without updating [personal](personal.md).
