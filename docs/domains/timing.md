---
type: domain
updated: 2026-11-14
sources:
  - racing_manager_db/db/migrate_manual_timing_2026_11_13.sql
  - racing_manager_back/prisma/schema.prisma
  - racing_manager_back/src/timing/
  - racing_manager_front/src/features/timing/
---

# Domain: timing

## Responsibility

Live manual timing of protocol categories: attempt lifecycle, number and tile capture, pending finishes, official-time corrections, the event-wide capture lock, closure with result and lap-split publication, and event-scoped access through the global `REFEREE` role.

## Public contracts

- **Roles:** `REFEREE` is a global product role; `ADMINISTRATOR` has the complete timing capability set; `ORGANIZER` alone has no timing surface. A user holds a set of roles and capabilities are the union. `PATCH /admin/users/:userId/referee-role` (`SetRefereeRoleDto.enabled`) grants or removes `REFEREE` for an administrator.
- **Attempt identity:** `event × start × format × gender × attemptNumber`. At most one `RUNNING` attempt per category; a cancelled attempt frees the category for a new attempt, a completed or incomplete one does not.
- **Surface:** `GET /events/:eventId/timing` → `TimingSurfaceView` with one `TimingCategoryBlockView` per timeable category (ordered by start, format, gender) and the capture-lock holder. `GET /events/:eventId/timing/attempts/:attemptId` → `TimingAttemptRecordView`.
- **Start:** `POST /events/:eventId/timing/attempts` (`StartTimingAttemptDto`) freezes the roster (enrollment, event-unique number, section, existing outcome) and records `officialStartedAt`; the response carries the first `ClockEpochView`. N is the start `lapCount`. A start is refused for no timeable participant, a missing number, a finished category, a completed/incomplete previous attempt, a cancelled/past-completed event or a workstation without the lock.
- **Capture:** `POST /events/:eventId/timing/passes` (`CaptureTimingPassDto`, `Idempotency-Key`) with kind `NUMBER`, `TILE` or `PENDING_FINISH`; a number auto-routes to the single running enrollment with fewer than N passes, asks for a choice only when two or more qualify, and otherwise creates nothing with a reason. Every capture mutation carries a per-workstation `deviceSequence`; `timing_capture_receipts` records applied/rejected sequences and `CompleteTimingAttemptDto.lastIssuedSequence` proves the outgoing queue is resolved.
- **Pending finishes:** `POST .../pending-finishes/:id/bind`, `POST .../pending-finishes/:id/cancel` (administrator + reason), and `POST .../attempts/:attemptId/undo` (quick undo of the last pass creation of that workstation only).
- **Clock:** a `ClockEpoch` anchors the client monotonic clock to an official elapsed value; reload/transfer opens a new epoch and continues the real elapsed time. `POST .../attempts/:attemptId/clock-epochs` returns `ClockEpochView`.
- **Corrections:** `PATCH .../passes/:passId/official-time`, `POST .../passes/:passId/cancel`, `POST .../passes/:passId/rebind` are administrator-only, require a reason and never rewrite the raw capture. A pass instant must be strictly after the official start and a total at most 24 hours.
- **Closure:** `POST .../attempts/:attemptId/complete`, `.../force-complete` (administrator + reason → `INCOMPLETE`), `.../cancel` (administrator + reason → `CANCELLED`, publishes nothing). Closure is atomic: attempt state, every eligible enrollment result, N splits and the closure report commit together or not at all.
- **Publication:** a closed `COMPLETED`/`INCOMPLETE` attempt writes each participant-at-N’s authoritative `FINISHED` enrollment result with the total and exactly N `TimingLapSplitDto` entries (`lapNumber`, `lapTimeMs`, `cumulativeMs`); `Result.timing_session_id` records provenance. Timing writes no place and no registration-only result.
- **Boundaries:** rows displayed in a multi-stage race section are excluded from timing and keep their heat-time flow; withdrawn enrollments and pre-existing outcomes are excluded. A start number cannot change while its registration is in a running attempt. Race creation is refused while the proposed field would capture a running-attempt participant. Legacy events without starts offer no timing. «Завершить гонку» is refused while an attempt runs and is read-only for timing after the finish.
- **Capture lock:** one event-wide row (`timing_capture_locks`) claimed explicitly by `POST .../capture/take`, moved by `.../capture/transfer` after the outgoing workstation’s receipts are confirmed, and released by an administrator through `.../capture/force-release`. A closure—ordinary, forced or cancelled—keeps the hold: the workstation that timed one category keeps capture for the next one, so a capture right after a category completion is never refused with `CAPTURE_NOT_HELD`. Releasing stays explicit. There is no automatic lease; a lost device waits for force-release. Removing `REFEREE` ends the hold on the next claim.

## MANUAL-TIMING-2 delta

- **Anonymous split:** Enter on the empty number field in normal capture mode creates a `TimingMark` of kind `ANONYMOUS_SPLIT` in the current block's running attempt, with no participant and no lap. The event-wide queue is the right column of the top control block (fixed area, internal scroll, no layout shift); the capture controls, current-block selector and number field stay in its left column. Assignment to a number of that attempt turns it into a pass at the original instant, reindexes laps and removes it immediately; a refused assignment keeps it queued. A `REFEREE` may cancel an unassigned split of an attempt they can operate, an `ADMINISTRATOR` any, with a reason; quick undo still retires only the last capture. An unassigned split blocks completion, force-completion and cancellation.
- **Heat attempt:** a multi-stage race is timed one heat at a time. The attempt is identified by event + race + `stageId` + `heatNumber` + attempt number; its roster comes from the heat's start list resolved to race-start enrollments; N is that race start's `lapCount`. A category attempt and a heat attempt of the same race can run concurrently. A heat closure writes only `ClassHeatTime` total + `OK` (no ordinary `Result`, no `result_splits`, no per-lap heat time, no place, no CMS call, no stage/qualification change). The manual heat-time form and stage commit keep `ORGANIZER`/`ADMINISTRATOR` access; a running heat blocks the manual form for that heat, and stage commitment/structural stage changes are blocked while any heat of the stage runs. The category attempt still excludes race-section rows with `RACE_SECTION`.
- **Closure gate:** gates read only the closing attempt's marks, receipts, splits and participants. A capture refused by the capture-lock or clock-epoch check, and a capture, tile, split assignment, pending bind or quick undo definitively refused after those checks, writes a `REJECTED` receipt so it cannot block closure; a foreign/stale `lastIssuedSequence` is not expanded into missing sequences. A capture-less attempt closes, and an all-excluded attempt closes publishing nothing. An unassigned split, an unbound pending finish and an unconfirmed sequence refuse closure with a Russian message naming the blocker.
- **Live elapsed:** a running attempt's displayed elapsed value updates at least every 100 ms from the existing epoch anchor, with no network request and no official write; a hidden tab may update less often.
- **Timing-page blocks:** every category and heat block collapses independently, keeping its header, state tag and actions visible while its body folds away. Participant tiles are compact and filled with their state colour, so more tiles fit on screen and a running or finished participant reads at a glance.
- **Per-block collapse:** each displayed protocol block has its own collapse state keyed by gender + category + section/race, expanded by default, page-session only. A block hidden by a filter loses its state and returns expanded; a rendered sibling keeps its state.
- **Routes:** `POST /events/:eventId/timing/heat-attempts` (`StartHeatAttemptDto`), `POST .../timing/splits/:splitId/assign`, `POST .../timing/splits/:splitId/cancel`, and `POST .../timing/passes` with `kind: 'ANONYMOUS_SPLIT'`. The existing closure/correction routes accept a heat attempt id; the category and heat closure reports add `publishedRegistrationIds`/`conflictRegistrationIds`.

## Code

- API: `racing_manager_back/src/timing/` (`timing.controller.ts`, `timing.service.ts`, `timing.repository.ts`, `timing.domain.ts`, `timing.dto.ts`, `timing.views.ts`, `timing.exception.filter.ts`), `src/admin/referee-role.*`.
- Front: `racing_manager_front/src/features/timing/`, `pages/TimingPage/`, the event-page `«Хронометраж»` entry and the `lapSplits` protocol column.
- SQL: `racing_manager_db/db/migrate_manual_timing_2026_11_13.sql` (+ down) and `migrate_referee_role_2026_11_13.sql` (+ down).

## Breakage signals

- A second `RUNNING` attempt of one category or one heat, or an attempt identified by a label or position.
- A capture accepted from a workstation without the event capture lock, or a silent claim on Start.
- A pass without a receipt/sequence, a duplicate sequence creating a second pass, or completion with a receipt gap.
- A raw capture changed by a correction, or an official-time correction without a reason/administrator.
- A closure that publishes a partial result set, a place, a registration-only result, a DNF or a synthetic split.
- A published participant with fewer or more than N splits, a cumulative N different from the total, or a split changing a place/tie/order.
- A heat attempt writing an ordinary `Result`, `result_splits`, `ClassHeatLapTime`, a place or a CMS advancement; a heat closure changing stage/qualification; a category attempt writing a heat time; a heat closure missing an at-N heat time, overwriting an existing heat time or publishing partially.
- Timing exposing a race-section row in a **category** attempt, or blocking ordinary result entry for a simple sibling section.
- A closure blocked by another attempt's mutation, a definitively refused capture-side action, a capture-less attempt or an all-excluded attempt.
- A start-number change allowed during a running attempt, or a race created over a running-attempt participant.
- The 100 ms display making a network request or changing an official value; a collapse of one protocol block changing a sibling.
- `ORGANIZER` without `REFEREE` offered a timing surface, or `REFEREE` unable to time any event.
