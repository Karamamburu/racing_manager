-- Rollback for START-CATEGORY-BRACKETS. Restores the old one-bracket-per-
-- event × format × gender shape. If the release created several races for one
-- category, keep those races and reconcile them before applying this down file:
-- the final unique index rejects duplicates.

BEGIN;

DROP INDEX IF EXISTS class_competitions_section_identity;
DROP INDEX IF EXISTS idx_class_competitions_start_id;
DROP INDEX IF EXISTS idx_class_competitions_target_groups;
DROP INDEX IF EXISTS idx_class_competitions_captured_enrollments;
DROP TRIGGER IF EXISTS trg_class_competitions_scope_exclusive ON class_competitions;
DROP FUNCTION IF EXISTS class_competitions_scope_exclusive();

ALTER TABLE class_competitions
  DROP COLUMN IF EXISTS start_id,
  DROP COLUMN IF EXISTS section_id,
  DROP COLUMN IF EXISTS section_kind,
  DROP COLUMN IF EXISTS target_key,
  DROP COLUMN IF EXISTS target_group_ids,
  DROP COLUMN IF EXISTS target_whole_category,
  DROP COLUMN IF EXISTS frozen_title,
  DROP COLUMN IF EXISTS frozen_subtitle,
  DROP COLUMN IF EXISTS frozen_youngest_bound,
  DROP COLUMN IF EXISTS frozen_member_bounds,
  DROP COLUMN IF EXISTS frozen_section_number,
  DROP COLUMN IF EXISTS captured_enrollment_ids,
  DROP COLUMN IF EXISTS captured_registration_ids;

CREATE UNIQUE INDEX IF NOT EXISTS class_competitions_event_format_gender_key
  ON class_competitions (event_id, format_id, gender);

COMMIT;
