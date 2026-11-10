-- AGE-CATEGORIES: category membership per protocol category
-- (event x start x participation format x gender).
-- One row = one base group inside one numbered age category.
-- Additive only: the legacy age_split_sections table stays as read-only
-- input for conversion. No HTTP behaviour change in this patch.
-- Apply on a disposable DB first; verify the paired *_down.sql before production.

BEGIN;

-- Stored category set -------------------------------------------------

CREATE TABLE age_split_categories (
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  start_id UUID NOT NULL REFERENCES starts(id) ON DELETE CASCADE,
  -- Participation formats are a catalogue: keep RESTRICT so a referenced
  -- format cannot disappear while a stored set still points at it.
  format_id INT NOT NULL REFERENCES participation_formats(id) ON DELETE RESTRICT,
  gender gender_type NOT NULL,
  category_number INT NOT NULL CHECK (category_number BETWEEN 1 AND 9),
  group_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, start_id, format_id, gender, category_number, group_id),
  CONSTRAINT age_split_categories_group_id_check CHECK (
    group_id IN (
      'AGE_LE_14',
      'AGE_15_16',
      'AGE_17_18',
      'AGE_19_20',
      'AGE_21_23',
      'AGE_24_40',
      'AGE_41_50',
      'AGE_51_60',
      'AGE_61_PLUS'
    )
  )
);

-- A base group belongs to at most one age category of a protocol category.
CREATE UNIQUE INDEX uq_age_split_categories_group
  ON age_split_categories (event_id, start_id, format_id, gender, group_id);
CREATE INDEX idx_age_split_categories_event_id
  ON age_split_categories (event_id);

COMMIT;
