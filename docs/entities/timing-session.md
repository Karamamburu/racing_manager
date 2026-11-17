---
type: entity
updated: 2026-11-14
sources:
  - racing_manager_back/prisma/schema.prisma
  - racing_manager_db/db/migrate_manual_timing_2026_11_13.sql
---

# Entity: TimingSession

One timed running of one protocol category, from its Start press to closure.

## Fields and identity

- Identity: `event_id × start_id × format_id × gender × attempt_number`.
- `status`: `RUNNING` | `COMPLETED` | `INCOMPLETE` | `CANCELLED`; only `RUNNING` is active.
- `attempt_kind`: `CATEGORY` | `HEAT`; a heat attempt also carries `class_competition_id`, `stage_id` and `heat_number`, and an `event × race × stage × heat × attempt number` identity. Category and heat attempts of the same race may run concurrently.
- `official_started_at` (server UTC), `client_started_at` (raw press), `started_by_user_id`, `closed_at`, `closed_by_user_id`, `closure_report` (JSONB snapshot).

## Related rows

- `timing_session_participants`: the frozen roster (`session_id`, `enrollment_id`, `registration_id`, start number, section, `required_laps`, `initial_outcome`, `excluded_reason`).
- `timing_marks`: a bound pass, an unbound pending finish, an anonymous split (kind `ANONYMOUS_SPLIT`, pending, no participant/lap) or a cancelled mark; raw `raw_captured_at`/`raw_elapsed_ms`, official `official_at`/`official_elapsed_ms`, optional `lap_number`, `clock_epoch_id`, workstation and device sequence.
- `timing_clock_epochs`: monotonic anchors (`official_elapsed_anchor_ms`) per attempt/workstation.
- `timing_capture_receipts`: applied/rejected per-workstation sequences.
- `timing_capture_locks`: one event-wide holder; no TTL.
- `timing_audit`: append-only actor/action/target/old/new/reason history.
- `result_splits`: N lap splits of a published result; `results.timing_session_id` names the publishing attempt.

## Rules

- N comes from the attempt’s start `lapCount`; the roster is frozen at Start.
- A raw capture is immutable; corrections change official values only, with a reason and an audit row.
- A closure publishes eligible enrollment results with N splits atomically; a cancelled attempt publishes nothing.
- See [timing domain](../domains/timing.md) and [results](../domains/results.md).
