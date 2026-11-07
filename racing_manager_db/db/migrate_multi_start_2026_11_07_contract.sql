-- MULTI-START result timing contract (T7, AD-3, AD-6).
-- Makes results.time_milliseconds nullable so non-FINISHED outcomes can be
-- stored with no timing, and replaces the expand-phase check with the full
-- FINISHED/non-finish rule.
-- Apply after the expand patch and after the T4 cutover dry-run schema check.
-- Pre-cutover rollback via *_contract_down.sql only; after data cutover use a
-- restored backup instead (AD-6).

BEGIN;

ALTER TABLE results ALTER COLUMN time_milliseconds DROP NOT NULL;

-- A registration now owns one Result per enrollment, so registration_id is no
-- longer unique. It stays populated as a denormalized convenience for legacy
-- reads and CMS until the expand-contract removal.
ALTER TABLE results DROP CONSTRAINT IF EXISTS results_registration_id_key;
CREATE INDEX IF NOT EXISTS idx_results_registration_id ON results (registration_id);

ALTER TABLE results
  DROP CONSTRAINT IF EXISTS results_time_milliseconds_check;
ALTER TABLE results
  DROP CONSTRAINT IF EXISTS results_outcome_timing_check;

ALTER TABLE results
  ADD CONSTRAINT results_outcome_timing_check
  CHECK (
    (outcome = 'FINISHED' AND time_milliseconds > 0)
    OR (outcome IN ('DNS', 'DNF', 'DSQ') AND time_milliseconds IS NULL)
    OR (outcome IS NULL AND time_milliseconds > 0)
  );

COMMIT;
