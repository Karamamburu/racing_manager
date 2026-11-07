-- MULTI-START schema expand rollback.
-- Pre-cutover only: use to verify the migration on a disposable DB.
-- After production data cutover, restore the pre-cutover backup instead
-- (AD-6): new Start/Enrollment/Result rows are not representable in the
-- old model.

BEGIN;

DROP TABLE IF EXISTS idempotency_records;

ALTER TABLE category_finishes
  DROP CONSTRAINT IF EXISTS category_finishes_start_fk;
DROP INDEX IF EXISTS uq_category_finishes_start;
DROP INDEX IF EXISTS idx_category_finishes_start_id;
ALTER TABLE category_finishes DROP COLUMN IF EXISTS start_id;

ALTER TABLE results
  DROP CONSTRAINT IF EXISTS results_outcome_timing_check;
ALTER TABLE results
  DROP CONSTRAINT IF EXISTS results_enrollment_fk;
DROP INDEX IF EXISTS uq_results_enrollment_id;
ALTER TABLE results DROP COLUMN IF EXISTS enrollment_id;
ALTER TABLE results DROP COLUMN IF EXISTS outcome;

DROP TABLE IF EXISTS enrollments;
DROP TABLE IF EXISTS start_formats;
DROP TABLE IF EXISTS starts;
DROP INDEX IF EXISTS uq_registrations_id_event;

DROP TYPE IF EXISTS result_outcome;
DROP TYPE IF EXISTS enrollment_status;
DROP TYPE IF EXISTS start_purpose_type;

COMMIT;
