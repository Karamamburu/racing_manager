-- MANUAL-TIMING-2 rollback: remove the heat attempt identity, its indexes,
-- the shape check and the timing_attempt_kind enum type.
--
-- FK-safe order: new indexes first, then the prior category-only indexes are
-- restored, then the check, the class-competitions foreign key and the four
-- columns, then the enum type.
--
-- KNOWN LIMIT: PostgreSQL cannot drop a single enum value. The
-- 'ANONYMOUS_SPLIT' value of timing_mark_kind is left in place on purpose;
-- removing it would mean recreating the type and rewriting timing_marks.kind,
-- which belongs to the base MANUAL-TIMING rollback, not to this patch.
-- This file performs no such rebuild.
--
-- KNOWN LIMIT: restoring the full category indexes fails if a rolled-back
-- database still holds a heat attempt beside the category attempt of the same
-- race, because the prior running index allows one RUNNING attempt per
-- (event, start, format, gender) and the prior unique repeats attempt_number.
-- Roll back such attempts through the product before running this file. No row
-- is deleted here.
--
-- No row is deleted from any Prisma migration bookkeeping table.

BEGIN;

-- Drop the heat indexes and the stage lookup index.
DROP INDEX IF EXISTS uq_timing_sessions_running_heat;
DROP INDEX IF EXISTS uq_timing_sessions_heat_attempt;
DROP INDEX IF EXISTS idx_timing_sessions_class_competition_stage;

-- Restore the category-only running index.
DROP INDEX IF EXISTS uq_timing_sessions_running_category;

CREATE UNIQUE INDEX uq_timing_sessions_running_category
  ON timing_sessions (event_id, start_id, format_id, gender)
  WHERE status = 'RUNNING';

-- Restore the category-only attempt unique.
DROP INDEX IF EXISTS uq_timing_sessions_category_attempt;

CREATE UNIQUE INDEX uq_timing_sessions_category_attempt
  ON timing_sessions (event_id, start_id, format_id, gender, attempt_number);

-- Drop the shape check, the race foreign key and the heat columns.
ALTER TABLE timing_sessions
  DROP CONSTRAINT IF EXISTS timing_sessions_attempt_shape_check;

ALTER TABLE timing_sessions
  DROP CONSTRAINT IF EXISTS timing_sessions_class_competition_fk;

ALTER TABLE timing_sessions DROP COLUMN IF EXISTS heat_number;
ALTER TABLE timing_sessions DROP COLUMN IF EXISTS stage_id;
ALTER TABLE timing_sessions DROP COLUMN IF EXISTS class_competition_id;
ALTER TABLE timing_sessions DROP COLUMN IF EXISTS attempt_kind;

DROP TYPE IF EXISTS timing_attempt_kind;

COMMIT;
