---
type: domain
updated: 2026-11-08
---

# Domain: results

## Responsibility

Authoritative race outcomes and timing for an enrollment; protocol place on read; category finishes.

## Public contracts

- **Source of truth:** `PUT /events/:eventId/enrollments/:enrollmentId/result`
  - body `UpsertEnrollmentResultDto`: `outcome` (`FINISHED` | `DNS` | `DNF` | `DSQ`); `timeMilliseconds` required, positive and ≤ 24 h for `FINISHED`; rejected for DNS/DNF/DSQ (timing cleared on correction)
  - `laps[]` is rejected with 400 (reserved for MANUAL-TIMING)
  - at most one authoritative Result per enrollment; corrections update the same row
  - WITHDRAWN enrollment → 400 (migrated historical WITHDRAWN+Result stays read-only history)
  - resource natural key is `enrollmentId`; optional HTTP replay uses `Idempotency-Key`
- **Retired:** `PUT /events/:eventId/registrations/:registrationId/result` → **410 Gone**; no Registration-only Results after cutover
- `POST /admin/events/:id/categories/finish` — start-aware; writes stored place snapshots only as non-SoT
- Ties to [Registration](../entities/registration.md) (container lifecycle) and `Enrollment` (participation state)

## Read model

- `ResultResponseDto`: `id`, `enrollmentId`, `registrationId`, `outcome`, `timeMilliseconds` (nullable), timestamps.
- Protocol place is **computed on read** per gender × start × format for comparable `FINISHED` results; DNS/DNF/DSQ and REGISTERED without a result are listed with `place === null`; WITHDRAWN is absent.
- `Enrollment.status` is only `REGISTERED` | `WITHDRAWN`; race outcomes live on `Result.outcome`.

## Code

- API: `racing_manager_back/src/results/`, parts of `events/`, `ranking/`
- Front: EventPage result cell / outcome select, `features/registrations/registrationsService.ts`

## Breakage signals

- Result payload shape or timing rules changed.
- Registration-scoped result path reintroduced as writable.
- Stored place treated as authoritative instead of computed.
- `laps[]` accepted on the enrollment result route.
