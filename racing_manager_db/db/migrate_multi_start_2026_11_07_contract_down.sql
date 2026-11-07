-- MULTI-START result timing contract rollback.
-- Pre-cutover only. Fails when non-FINISHED rows with null timing already
-- exist; after data cutover restore the pre-cutover backup instead (AD-6).

BEGIN;

ALTER TABLE results
  DROP CONSTRAINT IF EXISTS results_outcome_timing_check;

ALTER TABLE results ALTER COLUMN time_milliseconds SET NOT NULL;
ALTER TABLE results
  ADD CONSTRAINT results_time_milliseconds_check
  CHECK (time_milliseconds > 0);

ALTER TABLE results
  ADD CONSTRAINT results_outcome_timing_check
  CHECK (outcome IS NULL OR (outcome = 'FINISHED' AND time_milliseconds > 0));

COMMIT;
