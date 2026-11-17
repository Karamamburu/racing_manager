---
type: entity
updated: 2026-11-13
sources:
  - racing_manager_back/prisma/schema.prisma
---

# Entity: Registration

Participation record for an [Event](event.md). May be tied to a logged-in [User](user-and-roles.md) or a guest (denormalized person fields).

## Statuses

`REGISTERED`, `CONFIRMED`, `CANCELLED`, `WITHDRAWN`, `DNS`, `DNF`, `QQ`, `NQ`, `DSQ`, `FINISHED`.

## Uniqueness (ops rule)

- Logged-in: unique active registration by `user_id` per event (see SQL migrations).
- Guest: one active guest registration per person (name + birth year) per event.

Optional: start number, participation format, note. The authoritative race Result hangs off the enrollment (`Result.enrollmentId`); a legacy registration-only row is adopted on the first enrollment write. Timing publishes `FINISHED` with N splits into `result_splits`; see [timing domain](../domains/timing.md).

## API surface

Under `events/:eventId/registrations` — create (self/guest/for-user), list users, cancel, patch status/fields. See [registrations domain](../domains/registrations.md).

Consent to process/distribute personal data may be required at registration time; see [personal-consent](personal-consent.md).
