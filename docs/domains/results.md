---
type: domain
updated: 2026-11-13
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
- When a protocol category has an age-category configuration, the same rule applies inside each configured age category: comparisons stay inside `start × format × gender × CATEGORY_n`, and `REMAINDER` and `NO_BIRTH_YEAR` form their own standings lists, each with its own places. Ties share a place and skip the next, and unplaced outcomes keep `place === null`. A race section ranks only its captured field; outside-race rows and simple sections keep their own lists. Updated [events.md](events.md#age-categories-age-categories).
- Stored `Result.place` snapshots remain non-authoritative and are never touched by enabling, changing or disabling a configuration; they are not shown as the protocol place of a configured category.
- `Enrollment.status` is only `REGISTERED` | `WITHDRAWN`; race outcomes live on `Result.outcome`.

## Timing publication (MANUAL-TIMING)

- A closed timing attempt publishes the enrollment's authoritative `FINISHED` result with `timeMilliseconds` and exactly N lap splits into `result_splits`; `Result.timing_session_id` records the publishing attempt. Timing writes no place and no registration-only result. See [timing](timing.md).
- `ResultResponseDto` gains additive `laps?: TimingLapSplitDto[]` (`lapNumber`, `lapTimeMs`, `cumulativeMs`); `EventParticipant` gains additive `lapSplits?: TimingLapSplitDto[]`. The legacy `ResultLap` rows and `EventParticipant.laps` stay for historical and race-stage data.
- A manual upsert clears `result_splits` for that result; `laps[]` on `PUT .../enrollments/:enrollmentId/result` stays rejected (400). Timing is the only split writer.
- A timing-published result is republished after an official-time correction while the category is unfinished; a cancelled attempt publishes nothing; after the category finish neither the total nor the splits change.
- A split never breaks a tie, reorders rows or writes a stored place; the place stays computed on read from the total under the existing category/section rules.

## Code

- API: `racing_manager_back/src/results/`, parts of `events/`, `ranking/`
- Front: EventPage result cell / outcome select, `features/registrations/registrationsService.ts`

## Breakage signals

- Result payload shape or timing rules changed.
- Registration-scoped result path reintroduced as writable.
- Stored place treated as authoritative instead of computed.
- `laps[]` accepted on the enrollment result route.
- An age-category configuration changing stored place snapshots instead of only the computed read model.
- Ordinary result entry blocked for a simple section because a sibling section has a race.
- A race heat time or final classification writing to another start's enrollment or to a simple-section row.
- Ranking ignoring the age-category boundary when a protocol category is configured.
- A timing closure writing a place, a registration-only result, a result for an excluded/withdrawn/race participant, or a partial publication.
- A manual result upsert leaving `result_splits` or returning a split set.
- A published participant with fewer or more than N splits, a cumulative N different from the total, or a split changing a place, tie or row order.
