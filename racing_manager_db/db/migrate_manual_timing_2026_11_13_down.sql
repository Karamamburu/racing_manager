-- MANUAL-TIMING rollback: remove the timing tables, result_splits,
-- results.timing_session_id and the four timing enum types.
--
-- FK-safe order: children before parents, then the enum types.
-- The REFEREE role seed is not owned by this migration and is left in place.
-- No row is deleted from any Prisma migration bookkeeping table.

BEGIN;

DROP TABLE IF EXISTS result_splits;

ALTER TABLE results DROP CONSTRAINT IF EXISTS results_timing_session_fk;
DROP INDEX IF EXISTS idx_results_timing_session_id;
ALTER TABLE results DROP COLUMN IF EXISTS timing_session_id;

DROP TABLE IF EXISTS timing_audit;
DROP TABLE IF EXISTS timing_capture_locks;
DROP TABLE IF EXISTS timing_capture_receipts;
-- timing_marks must go before timing_clock_epochs: a mark references its epoch.
DROP TABLE IF EXISTS timing_marks;
DROP TABLE IF EXISTS timing_clock_epochs;
DROP TABLE IF EXISTS timing_session_participants;
DROP TABLE IF EXISTS timing_sessions;

DROP TYPE IF EXISTS timing_session_status;
DROP TYPE IF EXISTS timing_mark_kind;
DROP TYPE IF EXISTS timing_mark_status;
DROP TYPE IF EXISTS timing_receipt_status;

COMMIT;
