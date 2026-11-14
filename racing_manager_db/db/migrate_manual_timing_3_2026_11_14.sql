-- MANUAL-TIMING-3: block-free anonymous splits and number-only assignment.
-- Additive except for one relaxed NOT NULL and one widened receipt key.
-- No existing timing row is rewritten: pending anonymous marks are copied into
-- the event-scoped split model and stay readable as legacy records.
--
-- Apply on a disposable database first; verify the paired *_down.sql.

BEGIN;

-- Enums ---------------------------------------------------------------

CREATE TYPE timing_split_state AS ENUM (
  'QUEUED',
  'ASSIGNED',
  'UNDONE',
  'CANCELLED'
);

CREATE TYPE timing_capture_origin AS ENUM (
  'CAPTURE',
  'SPLIT_ASSIGN'
);

-- Event-scoped anonymous split ---------------------------------------
-- A split has no attempt until an assignment creates its pass. Its candidate
-- attempts are the attempts running at capture_instant, frozen in the child
-- table. legacy_mark_id links a split backfilled from the pre-change queue.

CREATE TABLE timing_event_splits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  state timing_split_state NOT NULL DEFAULT 'QUEUED',
  capture_instant TIMESTAMPTZ NOT NULL,
  anchor_clock_epoch_id UUID NOT NULL REFERENCES timing_clock_epochs(id) ON DELETE RESTRICT,
  anchor_attempt_id UUID NOT NULL REFERENCES timing_sessions(id) ON DELETE RESTRICT,
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

CREATE TABLE timing_anonymous_split_candidates (
  split_id UUID NOT NULL REFERENCES timing_event_splits(id) ON DELETE CASCADE,
  attempt_id UUID NOT NULL REFERENCES timing_sessions(id) ON DELETE CASCADE,
  PRIMARY KEY (split_id, attempt_id)
);

CREATE INDEX idx_timing_split_candidates_attempt
  ON timing_anonymous_split_candidates (attempt_id);

-- Event-wide capture ledger ------------------------------------------
-- A block-free capture and its assignment are not authored by one attempt, so
-- their sequence lives here. A confidently refused capture/assignment closes
-- its sequence on this ledger and never on a candidate attempt.

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

-- Event-scoped audit --------------------------------------------------

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

-- Attempt receipts gain an origin ------------------------------------
-- SPLIT_ASSIGN rows describe an assignment, not a capture. The closure
-- sequence coverage reads CAPTURE rows only, so an assignment sequence can
-- never mask or create a capture gap.

ALTER TABLE timing_capture_receipts
  ADD COLUMN origin timing_capture_origin NOT NULL DEFAULT 'CAPTURE';

ALTER TABLE timing_capture_receipts
  DROP CONSTRAINT timing_capture_receipts_pkey;

ALTER TABLE timing_capture_receipts
  ADD CONSTRAINT timing_capture_receipts_pkey
  PRIMARY KEY (session_id, workstation_instance_id, origin, device_sequence);

-- Split-derived passes have no attempt epoch -------------------------
-- A pass created by an assignment belongs to the resolved attempt but its
-- capture was anchored by another attempt's epoch. Source provenance replaces
-- the epoch provenance for exactly those rows; every existing mark keeps an
-- epoch, and the check keeps one provenance on every mark.

ALTER TABLE timing_marks
  ALTER COLUMN clock_epoch_id DROP NOT NULL;

ALTER TABLE timing_marks
  ADD COLUMN source_split_id UUID REFERENCES timing_event_splits(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX uq_timing_marks_source_split
  ON timing_marks (source_split_id);

ALTER TABLE timing_marks
  ADD CONSTRAINT timing_marks_capture_provenance_check
  CHECK (clock_epoch_id IS NOT NULL OR source_split_id IS NOT NULL);

-- Backfill the existing anonymous queue ------------------------------
-- The mark is left untouched: it stays the historical record. The split and
-- its single candidate make the old entry visible to the new queue and gate.

INSERT INTO timing_event_splits (
  event_id,
  state,
  capture_instant,
  anchor_clock_epoch_id,
  anchor_attempt_id,
  anchor_elapsed_anchor_ms,
  client_captured_at,
  client_elapsed_ms,
  captured_by_user_id,
  capture_workstation_instance_id,
  capture_device_sequence,
  legacy_mark_id,
  bound_attempt_id,
  created_at,
  updated_at
)
SELECT
  s.event_id,
  'QUEUED'::timing_split_state,
  m.official_at,
  m.clock_epoch_id,
  m.session_id,
  e.official_elapsed_anchor_ms,
  m.raw_captured_at,
  GREATEST(0, m.raw_elapsed_ms - e.official_elapsed_anchor_ms),
  a.actor_user_id,
  m.workstation_instance_id,
  m.device_sequence,
  m.id,
  m.session_id,
  m.created_at,
  m.updated_at
FROM timing_marks m
JOIN timing_sessions s ON s.id = m.session_id
JOIN timing_clock_epochs e ON e.id = m.clock_epoch_id
LEFT JOIN LATERAL (
  SELECT audit.actor_user_id
  FROM timing_audit audit
  WHERE audit.target_id = m.id::text
    AND audit.action = 'ANONYMOUS_SPLIT_CAPTURE'
  ORDER BY audit.created_at DESC, audit.id DESC
  LIMIT 1
) a ON true
WHERE m.kind = 'ANONYMOUS_SPLIT'
  AND m.status = 'PENDING'
ON CONFLICT (legacy_mark_id) DO NOTHING;

INSERT INTO timing_anonymous_split_candidates (split_id, attempt_id)
SELECT split.id, split.bound_attempt_id
FROM timing_event_splits split
WHERE split.legacy_mark_id IS NOT NULL
  AND split.bound_attempt_id IS NOT NULL
ON CONFLICT DO NOTHING;

COMMIT;
