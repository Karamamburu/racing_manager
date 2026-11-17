-- MANUAL-TIMING-3 rollback.
-- Refuses to run over split-derived passes: they are real timing results and
-- must be reported to a human, not silently deleted. A database with such rows
-- is left for a deliberate decision.
--
-- The event-scoped queue and its receipts/audit are removed. Legacy marks that
-- were only copied into the new tables are untouched and become the queue
-- again. Assignment receipts (SPLIT_ASSIGN) are removed with the origin.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM timing_marks WHERE source_split_id IS NOT NULL) THEN
    RAISE EXCEPTION
      'MANUAL-TIMING-3 down refused: split-derived passes exist in timing_marks; report them before rolling back';
  END IF;
END
$$;

ALTER TABLE timing_marks
  DROP CONSTRAINT IF EXISTS timing_marks_capture_provenance_check;

DROP INDEX IF EXISTS uq_timing_marks_source_split;

ALTER TABLE timing_marks
  DROP COLUMN IF EXISTS source_split_id;

ALTER TABLE timing_marks
  ALTER COLUMN clock_epoch_id SET NOT NULL;

DELETE FROM timing_capture_receipts
WHERE origin = 'SPLIT_ASSIGN';

ALTER TABLE timing_capture_receipts
  DROP CONSTRAINT timing_capture_receipts_pkey;

ALTER TABLE timing_capture_receipts
  DROP COLUMN origin;

ALTER TABLE timing_capture_receipts
  ADD CONSTRAINT timing_capture_receipts_pkey
  PRIMARY KEY (session_id, workstation_instance_id, device_sequence);

DROP TABLE IF EXISTS timing_event_audit;
DROP TABLE IF EXISTS timing_event_capture_receipts;
DROP TABLE IF EXISTS timing_anonymous_split_candidates;
DROP TABLE IF EXISTS timing_event_splits;

DROP TYPE IF EXISTS timing_capture_origin;
DROP TYPE IF EXISTS timing_split_state;

COMMIT;
