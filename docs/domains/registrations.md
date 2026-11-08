---
type: domain
updated: 2026-11-08
---

# Domain: registrations

## Responsibility

Create/update/cancel registrations (self, guest, for-user); enrollment selection; status transitions; uniqueness rules.

## Public contracts

- `POST /events/:eventId/registrations` (self), `/guest`, `/for-user` — body always includes non-empty `enrollments[]` (`{ startId, formatId }`), even for single-start events
- Administrator “Зарегистрировать участника” lists the event starts up front; at least one start and a format valid for each selected start are required. The same rule applies to the search-based for-user flow and the manual guest flow
- `PATCH /events/:eventId/registrations/:registrationId` — omit `enrollments` → unchanged; `[]` → 400; present array → desired REGISTERED set, applied atomically; `startNumber` may update in the same patch
- `POST /events/:eventId/registrations/cancel` — whole cancel; forbidden when any enrollment on the registration has a Result
- `PATCH …/:registrationId/status` — admin registration-container status; destructive statuses refuse when Results exist
- `POST /events/:eventId/registrations/test-batch` — admin test seeding; body `SeedTestRegistrationsDto` requires `count`, `gender`, `startId` and a `formatId` enabled on that start. Every generated registration gets one `REGISTERED` enrollment in that start; an invalid start/format or a partial failure creates nothing
- Entity: [Registration](../entities/registration.md)

## Enrollments (MULTI-START)

- `EnrollmentResponseDto`: `id`, `registrationId`, `startId`, `formatId`, `status` (`REGISTERED` | `WITHDRAWN`), computed `isCupEligible` (from start `purposeType === CUP_RACE`).
- Uniqueness: `(registrationId, startId)`; rows are never physically deleted.
- Desired-set rules: listed start with no row → create; `WITHDRAWN` without Result → reactivate same row; `REGISTERED` without Result → update format; Result-bearing enrollment listed unchanged → no-op; Result-bearing enrollment withdrawn/reactivated/format-changed → reject entire PATCH; omitted Result-bearing enrollment → reject; omitted Result-free enrollment → `WITHDRAWN`; at least one `REGISTERED` must remain.
- One active registration per person key per event: user `(eventId, userId)`, guest `(eventId, trimmed case-insensitive name + birthYear)`; guest and user paths share the same enrollment rules; duplicates → 409/400 with no partials.
- Concurrency: partial unique indexes on active person keys; concurrent duplicate creates cannot yield two active registrations.
- Idempotency: `Idempotency-Key` on mutating registration routes (Postgres store, ≥ 24 h).

## Code

- API: `racing_manager_back/src/registrations/`
- Front: `features/registrations`, EventPage register modals

## Breakage signals

- Registration status enum or uniqueness indexes changed.
- Guest vs user payload fields renamed/removed.
- Consent gates on register changed without updating [personal](personal.md).
- Create accepted without `enrollments[]`, or enrollments physically deleted.
