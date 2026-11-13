-- MANUAL-TIMING-2: heat attempts and anonymous splits.
--
-- Additive only: one enum type, four nullable/defaulted columns on
-- timing_sessions, a shape check, the partial attempt indexes that replace
-- the category-only ones, and one timing_mark_kind value.
--
-- AD-14: a heat attempt is a TimingSession variant, not a new table.
-- AD-22: expand-only; every existing row reads as 'CATEGORY'. ADD COLUMN ...
-- NOT NULL DEFAULT does not rewrite the table and needs no backfill.
--
-- Prisma cannot express partial indexes, so the category attempt unique,
-- the category running unique and the heat running unique live only here.
--
-- PostgreSQL 16 allows ALTER TYPE ... ADD VALUE inside a transaction; no
-- statement in this file uses the new value, so the commit order is safe.
--
-- Apply on a disposable DB first; verify the paired *_down.sql.

BEGIN;

-- Enums ---------------------------------------------------------------
-- Which identity a timing attempt belongs to: a protocol category or one
-- heat of a CMS stage of a race.

CREATE TYPE timing_attempt_kind AS ENUM ('CATEGORY', 'HEAT');

-- Attempt identity ----------------------------------------------------
-- A category attempt keeps all three heat fields null. A heat attempt
-- points at its race (class_competitions), its CMS stage and its heat.

ALTER TABLE timing_sessions
  ADD COLUMN attempt_kind timing_attempt_kind NOT NULL DEFAULT 'CATEGORY';

ALTER TABLE timing_sessions
  ADD COLUMN class_competition_id UUID NULL;

ALTER TABLE timing_sessions
  ADD COLUMN stage_id TEXT NULL;

ALTER TABLE timing_sessions
  ADD COLUMN heat_number INT NULL;

ALTER TABLE timing_sessions
  ADD CONSTRAINT timing_sessions_class_competition_fk
  FOREIGN KEY (class_competition_id)
  REFERENCES class_competitions (id) ON DELETE CASCADE;

ALTER TABLE timing_sessions
  ADD CONSTRAINT timing_sessions_attempt_shape_check
  CHECK (
    (
      attempt_kind = 'CATEGORY'
      AND class_competition_id IS NULL
      AND stage_id IS NULL
      AND heat_number IS NULL
    )
    OR
    (
      attempt_kind = 'HEAT'
      AND class_competition_id IS NOT NULL
      AND stage_id IS NOT NULL
      AND heat_number IS NOT NULL
      AND heat_number > 0
    )
  );

-- Attempt indexes -----------------------------------------------------
-- The previous category unique covered every attempt, so a heat attempt
-- would collide with the category attempt of the same race. Both category
-- indexes become partial, and the heat gets its own attempt and running
-- indexes.

DROP INDEX uq_timing_sessions_category_attempt;
DROP INDEX uq_timing_sessions_running_category;

CREATE UNIQUE INDEX uq_timing_sessions_category_attempt
  ON timing_sessions (event_id, start_id, format_id, gender, attempt_number)
  WHERE attempt_kind = 'CATEGORY';

-- One running category attempt per protocol category. A cancelled attempt
-- frees the category for a new attempt; a completed or incomplete one does
-- not.
CREATE UNIQUE INDEX uq_timing_sessions_running_category
  ON timing_sessions (event_id, start_id, format_id, gender)
  WHERE status = 'RUNNING' AND attempt_kind = 'CATEGORY';

-- One attempt per heat number. A completed, incomplete or cancelled heat
-- attempt frees the heat for the next attempt number.
CREATE UNIQUE INDEX uq_timing_sessions_heat_attempt
  ON timing_sessions (class_competition_id, stage_id, heat_number, attempt_number)
  WHERE attempt_kind = 'HEAT';

-- One running attempt per heat. A heat attempt runs beside the category
-- attempt of the same race and beside the other heats of its stage.
CREATE UNIQUE INDEX uq_timing_sessions_running_heat
  ON timing_sessions (class_competition_id, stage_id, heat_number)
  WHERE status = 'RUNNING' AND attempt_kind = 'HEAT';

CREATE INDEX idx_timing_sessions_class_competition_stage
  ON timing_sessions (class_competition_id, stage_id);

-- Marks ---------------------------------------------------------------
-- An anonymous split is captured against an attempt before it holds an
-- enrollment. No row in this migration uses the new value.
--
-- Guarded on purpose: PostgreSQL cannot drop a single enum value, so the
-- paired down file leaves 'ANONYMOUS_SPLIT' in place and a re-applied
-- migration must tolerate it. ALTER TYPE ... ADD VALUE on a pre-existing
-- type is allowed inside this transaction on PostgreSQL 16.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum AS e
    JOIN pg_type AS t ON t.oid = e.enumtypid
    WHERE t.typname = 'timing_mark_kind'
      AND e.enumlabel = 'ANONYMOUS_SPLIT'
  ) THEN
    ALTER TYPE timing_mark_kind ADD VALUE 'ANONYMOUS_SPLIT';
  END IF;
END
$$;

COMMIT;
