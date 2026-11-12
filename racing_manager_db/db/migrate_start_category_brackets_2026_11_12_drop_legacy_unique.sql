-- START-CATEGORY-BRACKETS follow-up: remove the legacy one-bracket-per-
-- event × format × gender unique index that Prisma created under its own name.
-- The scoped identity index (event, start, format, gender, target_key) replaces it.
-- Re-running is safe.

BEGIN;

DROP INDEX IF EXISTS class_competitions_event_format_gender_key;
DROP INDEX IF EXISTS class_competitions_event_class;

COMMIT;
