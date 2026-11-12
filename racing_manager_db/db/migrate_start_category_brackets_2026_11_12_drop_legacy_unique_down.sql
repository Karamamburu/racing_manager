-- Rollback for the legacy-unique-index cleanup. Restores the old
-- event × format × gender uniqueness only if the release did not create
-- several races for one category; reconcile duplicates first otherwise.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS class_competitions_event_format_gender_key
  ON class_competitions (event_id, format_id, gender);

COMMIT;
