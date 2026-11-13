-- MANUAL-TIMING: manual timing of concurrent protocol categories.
-- Additive only: four enum types, the timing attempt/capture tables,
-- result_splits and the nullable results.timing_session_id provenance column.
-- No existing row, column or constraint is rewritten.
--
-- The REFEREE role seed is NOT part of this patch (see the follow-up seed
-- in init.sql); this file only owns schema.
-- Prisma cannot express the partial unique index
-- uq_timing_sessions_running_category, so it lives here only.
-- Apply on a disposable DB first; verify the paired *_down.sql before production.

BEGIN;

-- Enums ---------------------------------------------------------------

CREATE TYPE timing_session_status AS ENUM (
  'RUNNING',
  'COMPLETED',
  'INCOMPLETE',
  'CANCELLED'
);

CREATE TYPE timing_mark_kind AS ENUM ('PASS', 'PENDING_FINISH');

CREATE TYPE timing_mark_status AS ENUM ('BOUND', 'PENDING', 'CANCELLED');

CREATE TYPE timing_receipt_status AS ENUM ('APPLIED', 'REJECTED');

-- Attempts ------------------------------------------------------------
-- One row per attempt of one protocol category
-- (event x start x participation format x gender) plus attempt_number.
-- The two composite foreign keys keep the attempt inside one event and on a
-- format that the start really offers.

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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT timing_sessions_attempt_number_check CHECK (attempt_number > 0),
  CONSTRAINT timing_sessions_start_same_event_fk
    FOREIGN KEY (start_id, event_id)
    REFERENCES starts (id, event_id) ON DELETE CASCADE,
  CONSTRAINT timing_sessions_format_on_start_fk
    FOREIGN KEY (start_id, format_id)
    REFERENCES start_formats (start_id, format_id)
);

CREATE UNIQUE INDEX uq_timing_sessions_category_attempt
  ON timing_sessions (event_id, start_id, format_id, gender, attempt_number);

-- One running attempt per protocol category. A cancelled attempt frees the
-- category for a new attempt; a completed or incomplete one does not.
CREATE UNIQUE INDEX uq_timing_sessions_running_category
  ON timing_sessions (event_id, start_id, format_id, gender)
  WHERE status = 'RUNNING';

CREATE INDEX idx_timing_sessions_event_id ON timing_sessions (event_id);

-- Frozen roster -------------------------------------------------------
-- Snapshot taken at the start press: enrollment, event-unique number,
-- displayed section, required laps (N) and the pre-existing outcome.

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
-- The first epoch anchors the workstation monotonic clock to official
-- elapsed 0. A reload or a transfer opens a new epoch at the server's
-- current elapsed anchor.

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

-- Marks ---------------------------------------------------------------
-- Raw capture is immutable; official_* columns are the values that
-- corrections may change. A mark is either a bound pass or a pending
-- finish; a cancelled mark keeps its row for the attempt history.

CREATE TABLE timing_marks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES timing_sessions(id) ON DELETE CASCADE,
  clock_epoch_id UUID NOT NULL
    REFERENCES timing_clock_epochs(id) ON DELETE CASCADE,
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
    CHECK (device_sequence IS NULL OR device_sequence > 0)
);

CREATE INDEX idx_timing_marks_session_status
  ON timing_marks (session_id, status);
CREATE INDEX idx_timing_marks_session_enrollment_elapsed
  ON timing_marks (session_id, enrollment_id, official_elapsed_ms);
CREATE INDEX idx_timing_marks_session_workstation_sequence
  ON timing_marks (session_id, workstation_instance_id, device_sequence);

-- Capture receipts ----------------------------------------------------
-- One final receipt per client device_sequence of an attempt. Completion
-- requires every sequence 1..lastIssuedSequence to hold a receipt.

CREATE TABLE timing_capture_receipts (
  session_id UUID NOT NULL REFERENCES timing_sessions(id) ON DELETE CASCADE,
  workstation_instance_id TEXT NOT NULL,
  device_sequence INT NOT NULL,
  status timing_receipt_status NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, workstation_instance_id, device_sequence),
  CONSTRAINT timing_capture_receipts_device_sequence_check
    CHECK (device_sequence > 0)
);

-- Capture lock --------------------------------------------------------
-- One row per event: the single workstation allowed to start and capture.
-- No lease timeout; release is a voluntary transfer or an explicit
-- administrator force-release.

CREATE TABLE timing_capture_locks (
  event_id UUID PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  workstation_instance_id TEXT NOT NULL,
  lock_token TEXT NOT NULL,
  held_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit ---------------------------------------------------------------
-- Append-only record of every start, capture, bind, correction, undo,
-- cancellation, transfer and closure.

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

-- Published splits ----------------------------------------------------
-- Authoritative per-lap splits written by a timing closure. Legacy
-- result_laps stays untouched for historical and hand-entered results.

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

-- Result provenance ---------------------------------------------------
-- The attempt that published an authoritative result. Nullable: legacy and
-- hand-entered results have no attempt, and a deleted attempt must not
-- delete the published result.

ALTER TABLE results ADD COLUMN timing_session_id UUID;

ALTER TABLE results
  ADD CONSTRAINT results_timing_session_fk
  FOREIGN KEY (timing_session_id)
  REFERENCES timing_sessions (id) ON DELETE SET NULL;

CREATE INDEX idx_results_timing_session_id ON results (timing_session_id);

COMMIT;
