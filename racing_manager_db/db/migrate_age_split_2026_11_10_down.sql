-- AGE-SPLIT rollback: age section set per protocol category.

BEGIN;

DROP TABLE IF EXISTS age_split_sections;
DROP TYPE IF EXISTS age_split_section_kind;

COMMIT;
