-- MANUAL-TIMING-3: split-derived passes must not borrow an attempt capture
-- sequence. Their assignment sequence lives on the SPLIT_ASSIGN attempt
-- receipt, the event receipt and the audit row; the mark itself has no capture
-- sequence. This normalises existing rows and makes a regression impossible at
-- the database boundary.
--
-- The closure coverage also compensates for a stale reader that still counts
-- marks, but the guard removes the ambiguous value entirely.

BEGIN;

UPDATE timing_marks
SET device_sequence = NULL
WHERE source_split_id IS NOT NULL;

ALTER TABLE timing_marks
  ADD CONSTRAINT timing_marks_split_capture_sequence_check
  CHECK (source_split_id IS NULL OR device_sequence IS NULL);

COMMIT;
