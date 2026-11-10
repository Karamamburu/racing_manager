-- AGE-CATEGORIES rollback: category membership per protocol category.
-- Only the new table is dropped; age_split_sections and its enum stay.

BEGIN;

DROP TABLE IF EXISTS age_split_categories;

COMMIT;
