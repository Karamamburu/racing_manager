-- Reverse the MANUAL-TIMING-3 split-sequence guard.
-- The assignment sequences are not restored into timing_marks on purpose:
-- they remain on the SPLIT_ASSIGN receipts and the audit rows, and restoring
-- them would reintroduce the capture-coverage ambiguity.

BEGIN;

ALTER TABLE timing_marks
  DROP CONSTRAINT IF EXISTS timing_marks_split_capture_sequence_check;

COMMIT;
