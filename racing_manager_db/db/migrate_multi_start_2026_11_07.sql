-- MULTI-START schema expand (AD-3, AD-6).
-- Additive only: no HTTP behavior changes in this patch.
-- Apply on a disposable DB first; verify the paired *_down.sql before production.
-- Pre-cutover rollback only. After data cutover, restore a backup instead.

BEGIN;

-- Enums ---------------------------------------------------------------

CREATE TYPE start_purpose_type AS ENUM ('CUP_RACE', 'CONTROL_TRAINING');
CREATE TYPE enrollment_status AS ENUM ('REGISTERED', 'WITHDRAWN');
CREATE TYPE result_outcome AS ENUM ('FINISHED', 'DNS', 'DNF', 'DSQ');

-- Starts --------------------------------------------------------------

CREATE TABLE starts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  purpose_type start_purpose_type NOT NULL,
  lap_count INT NOT NULL CHECK (lap_count > 0),
  lap_length_meters INT NOT NULL CHECK (lap_length_meters > 0),
  display_name TEXT,
  sort_order INT NOT NULL CHECK (sort_order >= 0),
  legacy_effective_distance_m INT
    CHECK (legacy_effective_distance_m IS NULL OR legacy_effective_distance_m > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_starts_id_event ON starts (id, event_id);
CREATE UNIQUE INDEX uq_starts_event_sort_order ON starts (event_id, sort_order);
CREATE INDEX idx_starts_event_id ON starts (event_id);

CREATE TABLE start_formats (
  start_id UUID NOT NULL REFERENCES starts(id) ON DELETE CASCADE,
  format_id INT NOT NULL REFERENCES participation_formats(id),
  PRIMARY KEY (start_id, format_id)
);

CREATE INDEX idx_start_formats_format_id ON start_formats (format_id);

-- Enrollments ---------------------------------------------------------

CREATE UNIQUE INDEX uq_registrations_id_event ON registrations (id, event_id);

CREATE TABLE enrollments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL,
  registration_id UUID NOT NULL,
  start_id UUID NOT NULL,
  format_id INT NOT NULL,
  status enrollment_status NOT NULL DEFAULT 'REGISTERED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT enrollments_registration_same_event
    FOREIGN KEY (registration_id, event_id)
    REFERENCES registrations (id, event_id) ON DELETE CASCADE,
  CONSTRAINT enrollments_start_same_event
    FOREIGN KEY (start_id, event_id)
    REFERENCES starts (id, event_id) ON DELETE CASCADE,
  CONSTRAINT enrollments_format_on_start
    FOREIGN KEY (start_id, format_id)
    REFERENCES start_formats (start_id, format_id)
);

CREATE UNIQUE INDEX uq_enrollments_registration_start
  ON enrollments (registration_id, start_id);
CREATE INDEX idx_enrollments_event_id ON enrollments (event_id);
CREATE INDEX idx_enrollments_start_id ON enrollments (start_id);
CREATE INDEX idx_enrollments_status ON enrollments (status);

-- Results: enrollment-scoped SoT (expand phase) ----------------------

ALTER TABLE results ADD COLUMN outcome result_outcome;
ALTER TABLE results ADD COLUMN enrollment_id UUID;

CREATE UNIQUE INDEX uq_results_enrollment_id ON results (enrollment_id);
ALTER TABLE results
  ADD CONSTRAINT results_enrollment_fk
  FOREIGN KEY (enrollment_id) REFERENCES enrollments (id) ON DELETE CASCADE;

-- Expand phase keeps results.time_milliseconds NOT NULL and registration_id
-- REQUIRED so the pre-cutover app keeps compiling. T7 changes nullability and
-- replaces this transitional check with the full FINISHED/non-finish rule.
ALTER TABLE results
  ADD CONSTRAINT results_outcome_timing_check
  CHECK (outcome IS NULL OR (outcome = 'FINISHED' AND time_milliseconds > 0));

-- Category finish: start-aware (AD-2), expand phase ------------------

ALTER TABLE category_finishes ADD COLUMN start_id UUID;
CREATE INDEX idx_category_finishes_start_id ON category_finishes (start_id);
CREATE UNIQUE INDEX uq_category_finishes_start
  ON category_finishes (event_id, start_id, format_id, gender);
ALTER TABLE category_finishes
  ADD CONSTRAINT category_finishes_start_fk
  FOREIGN KEY (start_id) REFERENCES starts (id) ON DELETE CASCADE;

-- Keep the legacy category_finishes_event_class index until T7 migrates
-- existing finish rows onto their cutover start and drops the old lock.

-- Idempotency (AD-1) --------------------------------------------------

CREATE TABLE idempotency_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_key TEXT NOT NULL,
  http_method TEXT NOT NULL,
  route_template TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  response_status INT NOT NULL,
  response_body JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX uq_idempotency_scope
  ON idempotency_records (actor_key, http_method, route_template, idempotency_key);
CREATE INDEX idx_idempotency_records_expires_at
  ON idempotency_records (expires_at);

COMMIT;
