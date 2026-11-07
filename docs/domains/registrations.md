---
type: domain
updated: 2026-11-07
---

# Domain: registrations

## Responsibility

Create/update/cancel registrations (self, guest, for-user); status transitions; uniqueness rules.

## Public contracts

- `POST/GET/PATCH …/events/:eventId/registrations/*` (incl. guest, for-user, cancel, status)
- Entity: [Registration](../entities/registration.md)

## MULTI-START transition

Parser accepts future `enrollments[]` omit/`[]`/desired-set shape, but the live `PATCH` path **rejects** `enrollments` and empty bodies until T6 (`assertSupportedRegistrationUpdate`); `startNumber` remains required on the live path. Spec: `specs/multi-start-ears.md`.

## Code

- API: `racing_manager_back/src/registrations/`
- Front: `features/registrations`, EventPage register modals

## Breakage signals

- Registration status enum or uniqueness indexes changed.
- Guest vs user payload fields renamed/removed.
- Consent gates on register changed without updating [personal](personal.md).
- Silent accept of `enrollments` on PATCH before T6 apply exists.
