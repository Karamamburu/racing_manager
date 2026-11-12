-- START-CATEGORY-BRACKETS: scope one multi-stage race to a start and a frozen
-- age membership instead of the whole event × format × gender category.
-- Apply after the existing schema. Re-running is safe.

BEGIN;

ALTER TABLE class_competitions
  ADD COLUMN IF NOT EXISTS start_id UUID REFERENCES starts(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS section_id TEXT,
  ADD COLUMN IF NOT EXISTS section_kind TEXT,
  ADD COLUMN IF NOT EXISTS target_key TEXT NOT NULL DEFAULT 'WHOLE',
  ADD COLUMN IF NOT EXISTS target_group_ids TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS target_whole_category BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS frozen_title TEXT,
  ADD COLUMN IF NOT EXISTS frozen_subtitle TEXT,
  ADD COLUMN IF NOT EXISTS frozen_youngest_bound INT,
  ADD COLUMN IF NOT EXISTS frozen_member_bounds INT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS frozen_section_number INT,
  ADD COLUMN IF NOT EXISTS captured_enrollment_ids TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS captured_registration_ids TEXT[] NOT NULL DEFAULT '{}';

DROP INDEX IF EXISTS class_competitions_event_class;
DROP INDEX IF EXISTS class_competitions_event_format_gender_key;

-- Backfill every existing race as a whole-category race bound to the event's
-- single start or, when there are several, the start with the lowest sort order.
UPDATE class_competitions AS cc
SET start_id = (
  SELECT s.id
  FROM starts AS s
  WHERE s.event_id = cc.event_id
  ORDER BY s.sort_order ASC, s.id ASC
  LIMIT 1
)
WHERE cc.start_id IS NULL;

UPDATE class_competitions
SET section_id = COALESCE(section_id, 'CATEGORY'),
    section_kind = COALESCE(section_kind, 'CATEGORY'),
    target_key = COALESCE(NULLIF(target_key, ''), 'WHOLE'),
    target_whole_category = TRUE,
    frozen_title = COALESCE(frozen_title, 'Категория'),
    frozen_youngest_bound = COALESCE(frozen_youngest_bound, 0),
    frozen_member_bounds = COALESCE(frozen_member_bounds, '{}')
WHERE section_id IS NULL
   OR section_kind IS NULL
   OR frozen_title IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS class_competitions_section_identity
  ON class_competitions (
    event_id,
    COALESCE(start_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(format_id, -1),
    gender,
    target_key
  );

CREATE INDEX IF NOT EXISTS idx_class_competitions_start_id
  ON class_competitions (start_id);
CREATE INDEX IF NOT EXISTS idx_class_competitions_target_groups
  ON class_competitions USING GIN (target_group_ids);
CREATE INDEX IF NOT EXISTS idx_class_competitions_captured_enrollments
  ON class_competitions USING GIN (captured_enrollment_ids);

-- A whole-category race is exclusive with every section race of the same
-- protocol category. The code checks this, and the trigger keeps concurrent
-- creation honest.
CREATE OR REPLACE FUNCTION class_competitions_scope_exclusive()
RETURNS trigger AS $$
BEGIN
  IF NEW.target_whole_category THEN
    IF EXISTS (
      SELECT 1
      FROM class_competitions AS other
      WHERE other.event_id = NEW.event_id
        AND COALESCE(other.start_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = COALESCE(NEW.start_id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND COALESCE(other.format_id, -1) = COALESCE(NEW.format_id, -1)
        AND other.gender = NEW.gender
        AND other.id <> NEW.id
    ) THEN
      RAISE EXCEPTION 'protocol category already has a race'
        USING ERRCODE = '23505';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1
      FROM class_competitions AS other
      WHERE other.event_id = NEW.event_id
        AND COALESCE(other.start_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = COALESCE(NEW.start_id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND COALESCE(other.format_id, -1) = COALESCE(NEW.format_id, -1)
        AND other.gender = NEW.gender
        AND other.target_whole_category = TRUE
        AND other.id <> NEW.id
    ) THEN
      RAISE EXCEPTION 'protocol category already has a whole-category race'
        USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_class_competitions_scope_exclusive ON class_competitions;
CREATE TRIGGER trg_class_competitions_scope_exclusive
  BEFORE INSERT OR UPDATE OF start_id, format_id, gender, target_whole_category
  ON class_competitions
  FOR EACH ROW EXECUTE FUNCTION class_competitions_scope_exclusive();

COMMIT;
