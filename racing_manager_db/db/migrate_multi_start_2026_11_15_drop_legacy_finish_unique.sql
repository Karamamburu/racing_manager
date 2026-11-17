-- The multi-start model identifies a finished classification by
-- (event, start, format, gender). The legacy event/format/gender unique index
-- predates starts and blocks finishing the same format+gender on a second
-- start. The start-aware unique index already exists.

BEGIN;

DROP INDEX IF EXISTS category_finishes_event_class;

COMMIT;
