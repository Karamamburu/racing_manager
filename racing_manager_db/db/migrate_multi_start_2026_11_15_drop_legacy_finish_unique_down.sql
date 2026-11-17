-- Restore the legacy classification key. It can fail on an event that already
-- has two starts with the same format and gender, which is the data shape this
-- migration intentionally enables; a deliberate human decision is required.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS category_finishes_event_class
  ON category_finishes (event_id, gender, COALESCE(format_id, -1));

COMMIT;
