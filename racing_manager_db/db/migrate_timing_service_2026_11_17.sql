-- MANUAL-TIMING (consolidated production migration)
-- Single schema patch for the timing service: manual attempts, captures,
-- anonymous splits, heat attempts, event capture ledger and published splits.
--
-- Target: a production database that does NOT yet have the timing schema.
-- The guard below refuses a partial or already-applied timing schema; use the
-- individual migrations in that case. The base tables (events, starts,
-- start_formats, class_competitions, users, enrollments, registrations,
-- results) must already exist.
--
-- Apply in one transaction on a disposable database first, then production.

BEGIN;

-- Preflight -----------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.timing_sessions') IS NOT NULL
     OR to_regclass('public.timing_event_splits') IS NOT NULL
     OR to_regclass('public.result_splits') IS NOT NULL
     OR to_regtype('public.timing_session_status') IS NOT NULL
     OR to_regtype('public.timing_split_state') IS NOT NULL THEN
    RAISE EXCEPTION
      'Timing schema already exists. Apply the individual timing migrations instead of this consolidated file.';
  END IF;

  IF to_regclass('public.class_competitions') IS NULL
     OR to_regclass('public.starts') IS NULL
     OR to_regclass('public.start_formats') IS NULL
     OR to_regclass('public.results') IS NULL THEN
    RAISE EXCEPTION
      'Base schema is incomplete: events, starts, start_formats, class_competitions and results must exist before the timing schema.';
  END IF;
END
$$;

-- Enums ---------------------------------------------------------------

CREATE TYPE timing_session_status AS ENUM (
  'RUNNING',
  'COMPLETED',
  'INCOMPLETE',
  'CANCELLED'
);

CREATE TYPE timing_mark_kind AS ENUM (
  'PASS',
  'PENDING_FINISH',
  'ANONYMOUS_SPLIT'
);

CREATE TYPE timing_mark_status AS ENUM ('BOUND', 'PENDING', 'CANCELLED');

CREATE TYPE timing_receipt_status AS ENUM ('APPLIED', 'REJECTED');

CREATE TYPE timing_attempt_kind AS ENUM ('CATEGORY', 'HEAT');

CREATE TYPE timing_split_state AS ENUM (
  'QUEUED',
  'ASSIGNED',
  'UNDONE',
  'CANCELLED'
);

CREATE TYPE timing_capture_origin AS ENUM ('CAPTURE', 'SPLIT_ASSIGN');

-- Attempts ------------------------------------------------------------
-- One category or heat attempt. The composite foreign keys keep the attempt
-- inside one event and on a format that the start really offers.

CREATE TABLE timing_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  start_id UUID NOT NULL,
  format_id INT NOT NULL,
  gender gender_type NOT NULL,
  attempt_number INT NOT NULL,
  status timing_session_status NOT NULL DEFAULT 'RUNNING',
  official_started_at TIMESTAMPTZ NOT NULL,
  client_started_at TIMESTAMPTZ NOT NULL,
  started_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  closed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  closure_report JSONB,
  attempt_kind timing_attempt_kind NOT NULL DEFAULT 'CATEGORY',
  class_competition_id UUID,
  stage_id TEXT,
  heat_number INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT timing_sessions_attempt_number_check CHECK (attempt_number > 0),
  CONSTRAINT timing_sessions_class_competition_fk
    FOREIGN KEY (class_competition_id)
    REFERENCES class_competitions (id) ON DELETE CASCADE,
  CONSTRAINT timing_sessions_start_same_event_fk
    FOREIGN KEY (start_id, event_id)
    REFERENCES starts (id, event_id) ON DELETE CASCADE,
  CONSTRAINT timing_sessions_format_on_start_fk
    FOREIGN KEY (start_id, format_id)
    REFERENCES start_formats (start_id, format_id),
  CONSTRAINT timing_sessions_attempt_shape_check
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
    )
);

CREATE UNIQUE INDEX uq_timing_sessions_category_attempt
  ON timing_sessions (event_id, start_id, format_id, gender, attempt_number)
  WHERE attempt_kind = 'CATEGORY';

CREATE UNIQUE INDEX uq_timing_sessions_running_category
  ON timing_sessions (event_id, start_id, format_id, gender)
  WHERE status = 'RUNNING' AND attempt_kind = 'CATEGORY';

CREATE UNIQUE INDEX uq_timing_sessions_heat_attempt
  ON timing_sessions (class_competition_id, stage_id, heat_number, attempt_number)
  WHERE attempt_kind = 'HEAT';

CREATE UNIQUE INDEX uq_timing_sessions_running_heat
  ON timing_sessions (class_competition_id, stage_id, heat_number)
  WHERE status = 'RUNNING' AND attempt_kind = 'HEAT';

CREATE INDEX idx_timing_sessions_event_id ON timing_sessions (event_id);
CREATE INDEX idx_timing_sessions_class_competition_stage
  ON timing_sessions (class_competition_id, stage_id);

-- Frozen roster -------------------------------------------------------

CREATE TABLE timing_session_participants (
  session_id UUID NOT NULL REFERENCES timing_sessions(id) ON DELETE CASCADE,
  enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  registration_id UUID NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  start_number INT,
  section_id TEXT,
  required_laps INT NOT NULL,
  initial_outcome result_outcome,
  excluded_reason TEXT,
  PRIMARY KEY (session_id, enrollment_id),
  CONSTRAINT timing_session_participants_start_number_check
    CHECK (start_number IS NULL OR start_number > 0),
  CONSTRAINT timing_session_participants_required_laps_check
    CHECK (required_laps > 0)
);

CREATE INDEX idx_timing_session_participants_enrollment_id
  ON timing_session_participants (enrollment_id);

-- Clock epochs --------------------------------------------------------

CREATE TABLE timing_clock_epochs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES timing_sessions(id) ON DELETE CASCADE,
  workstation_instance_id TEXT NOT NULL,
  official_elapsed_anchor_ms INT NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  opened_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT timing_clock_epochs_anchor_check
    CHECK (official_elapsed_anchor_ms >= 0)
);

CREATE INDEX idx_timing_clock_epochs_session_workstation
  ON timing_clock_epochs (session_id, workstation_instance_id);

-- Event-scoped anonymous split ---------------------------------------
-- A split has no attempt until assignment; its candidates are frozen at the
-- capture instant. legacy_mark_id is retained for a historical mark.

CREATE TABLE timing_event_splits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  state timing_split_state NOT NULL DEFAULT 'QUEUED',
  capture_instant TIMESTAMPTZ NOT NULL,
  anchor_clock_epoch_id UUID NOT NULL
    REFERENCES timing_clock_epochs(id) ON DELETE RESTRICT,
  anchor_attempt_id UUID NOT NULL
    REFERENCES timing_sessions(id) ON DELETE RESTRICT,
  anchor_elapsed_anchor_ms INT NOT NULL,
  client_captured_at TIMESTAMPTZ NOT NULL,
  client_elapsed_ms INT NOT NULL,
  captured_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  capture_workstation_instance_id TEXT NOT NULL,
  capture_device_sequence INT,
  legacy_mark_id UUID UNIQUE,
  bound_attempt_id UUID REFERENCES timing_sessions(id) ON DELETE RESTRICT,
  assigned_attempt_id UUID REFERENCES timing_sessions(id) ON DELETE RESTRICT,
  assigned_at TIMESTAMPTZ,
  assigned_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_workstation_instance_id TEXT,
  assignment_device_sequence INT,
  offered_attempt_ids JSONB,
  chosen_by_referee BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_workstation_instance_id TEXT,
  resolution_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT timing_event_splits_legacy_bound_check
    CHECK ((bound_attempt_id IS NULL) = (legacy_mark_id IS NULL)),
  CONSTRAINT timing_event_splits_capture_sequence_check
    CHECK (capture_device_sequence IS NULL OR capture_device_sequence > 0),
  CONSTRAINT timing_event_splits_assignment_sequence_check
    CHECK (assignment_device_sequence IS NULL OR assignment_device_sequence > 0),
  CONSTRAINT timing_event_splits_capture_elapsed_check
    CHECK (client_elapsed_ms >= 0),
  CONSTRAINT timing_event_splits_anchor_elapsed_check
    CHECK (anchor_elapsed_anchor_ms >= 0)
);

CREATE INDEX idx_timing_event_splits_event_state
  ON timing_event_splits (event_id, state, capture_instant);

-- Marks ---------------------------------------------------------------
-- Raw capture is immutable; official_* columns may be corrected. A split
-- assignment has no attempt epoch: source_split_id replaces it and its
-- assignment sequence lives on the receipt/audit, never on the mark.

CREATE TABLE timing_marks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES timing_sessions(id) ON DELETE CASCADE,
  clock_epoch_id UUID REFERENCES timing_clock_epochs(id) ON DELETE CASCADE,
  source_split_id UUID REFERENCES timing_event_splits(id) ON DELETE SET NULL,
  enrollment_id UUID REFERENCES enrollments(id) ON DELETE SET NULL,
  registration_id UUID REFERENCES registrations(id) ON DELETE SET NULL,
  start_number INT,
  kind timing_mark_kind NOT NULL,
  raw_captured_at TIMESTAMPTZ NOT NULL,
  raw_elapsed_ms INT NOT NULL,
  official_at TIMESTAMPTZ NOT NULL,
  official_elapsed_ms INT NOT NULL,
  lap_number INT,
  status timing_mark_status NOT NULL,
  workstation_instance_id TEXT NOT NULL,
  device_sequence INT,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT timing_marks_raw_elapsed_ms_check CHECK (raw_elapsed_ms > 0),
  CONSTRAINT timing_marks_official_elapsed_ms_check
    CHECK (official_elapsed_ms > 0),
  CONSTRAINT timing_marks_lap_number_check
    CHECK (lap_number IS NULL OR lap_number > 0),
  CONSTRAINT timing_marks_start_number_check
    CHECK (start_number IS NULL OR start_number > 0),
  CONSTRAINT timing_marks_device_sequence_check
    CHECK (device_sequence IS NULL OR device_sequence > 0),
  CONSTRAINT timing_marks_capture_provenance_check
    CHECK (clock_epoch_id IS NOT NULL OR source_split_id IS NOT NULL),
  CONSTRAINT timing_marks_split_capture_sequence_check
    CHECK (source_split_id IS NULL OR device_sequence IS NULL)
);

CREATE UNIQUE INDEX uq_timing_marks_source_split
  ON timing_marks (source_split_id);
CREATE INDEX idx_timing_marks_session_status
  ON timing_marks (session_id, status);
CREATE INDEX idx_timing_marks_session_enrollment_elapsed
  ON timing_marks (session_id, enrollment_id, official_elapsed_ms);
CREATE INDEX idx_timing_marks_session_workstation_sequence
  ON timing_marks (session_id, workstation_instance_id, device_sequence);

-- Split candidates ----------------------------------------------------

CREATE TABLE timing_anonymous_split_candidates (
  split_id UUID NOT NULL REFERENCES timing_event_splits(id) ON DELETE CASCADE,
  attempt_id UUID NOT NULL REFERENCES timing_sessions(id) ON DELETE CASCADE,
  PRIMARY KEY (split_id, attempt_id)
);

CREATE INDEX idx_timing_split_candidates_attempt
  ON timing_anonymous_split_candidates (attempt_id);

-- Capture receipts ----------------------------------------------------
-- Every client device sequence of an attempt has one final receipt. The
-- origin separates a real capture from a split assignment.

CREATE TABLE timing_capture_receipts (
  session_id UUID NOT NULL REFERENCES timing_sessions(id) ON DELETE CASCADE,
  workstation_instance_id TEXT NOT NULL,
  origin timing_capture_origin NOT NULL DEFAULT 'CAPTURE',
  device_sequence INT NOT NULL,
  status timing_receipt_status NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, workstation_instance_id, origin, device_sequence),
  CONSTRAINT timing_capture_receipts_device_sequence_check
    CHECK (device_sequence > 0)
);

-- Event-wide capture ledger ------------------------------------------

CREATE TABLE timing_event_capture_receipts (
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  workstation_instance_id TEXT NOT NULL,
  device_sequence INT NOT NULL CHECK (device_sequence > 0),
  status timing_receipt_status NOT NULL,
  reason TEXT,
  split_id UUID,
  resolved_attempt_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, workstation_instance_id, device_sequence)
);

CREATE INDEX idx_timing_event_receipts_workstation_time
  ON timing_event_capture_receipts (event_id, workstation_instance_id, created_at);

-- Capture lock --------------------------------------------------------

CREATE TABLE timing_capture_locks (
  event_id UUID PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  workstation_instance_id TEXT NOT NULL,
  lock_token TEXT NOT NULL,
  held_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit ---------------------------------------------------------------

CREATE TABLE timing_audit (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES timing_sessions(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  old_values JSONB,
  new_values JSONB,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_timing_audit_session_created_at
  ON timing_audit (session_id, created_at);

CREATE TABLE timing_event_audit (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  old_values JSONB,
  new_values JSONB,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_timing_event_audit_event_created_at
  ON timing_event_audit (event_id, created_at);

-- Published splits and result provenance -----------------------------

CREATE TABLE result_splits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  result_id UUID NOT NULL REFERENCES results(id) ON DELETE CASCADE,
  lap_number INT NOT NULL,
  lap_time_ms INT NOT NULL,
  cumulative_ms INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT result_splits_lap_number_check CHECK (lap_number > 0),
  CONSTRAINT result_splits_lap_time_ms_check CHECK (lap_time_ms > 0),
  CONSTRAINT result_splits_cumulative_ms_check CHECK (cumulative_ms > 0)
);

CREATE UNIQUE INDEX uq_result_splits_result_lap
  ON result_splits (result_id, lap_number);
CREATE INDEX idx_result_splits_result_id ON result_splits (result_id);

ALTER TABLE results ADD COLUMN timing_session_id UUID;

ALTER TABLE results
  ADD CONSTRAINT results_timing_session_fk
  FOREIGN KEY (timing_session_id)
  REFERENCES timing_sessions (id) ON DELETE SET NULL;

CREATE INDEX idx_results_timing_session_id ON results (timing_session_id);

-- Global referee role -------------------------------------------------
-- Idempotent: a fresh init.sql already seeds REFEREE; an older database gets it
-- here. No user_roles row is written.

INSERT INTO roles (code, name) VALUES ('REFEREE', 'Referee')
ON CONFLICT (code) DO NOTHING;

COMMIT;
