-- AGE-SPLIT: age section set per protocol category
-- (event x start x participation format x gender).
-- Additive only: no HTTP behaviour change in this patch.
-- Apply on a disposable DB first; verify the paired *_down.sql before production.

BEGIN;

-- Enums ---------------------------------------------------------------

CREATE TYPE age_split_section_kind AS ENUM ('BASE_GROUP', 'PRESET');

-- Stored section set --------------------------------------------------

CREATE TABLE age_split_sections (
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  start_id UUID NOT NULL REFERENCES starts(id) ON DELETE CASCADE,
  -- Participation formats are a catalogue: keep RESTRICT so a referenced
  -- format cannot disappear while a stored set still points at it.
  format_id INT NOT NULL REFERENCES participation_formats(id) ON DELETE RESTRICT,
  gender gender_type NOT NULL,
  section_id TEXT NOT NULL,
  section_kind age_split_section_kind NOT NULL,
  sort_order INT NOT NULL CHECK (sort_order >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, start_id, format_id, gender, section_id),
  CONSTRAINT age_split_sections_section_id_check CHECK (
    section_id IN (
      'AGE_LE_14',
      'AGE_15_16',
      'AGE_17_18',
      'AGE_19_20',
      'AGE_21_23',
      'AGE_24_40',
      'AGE_41_50',
      'AGE_51_60',
      'AGE_61_PLUS',
      'PRESET_JUNIOR_UNDER_24',
      'PRESET_MASTERS_41_PLUS'
    )
  )
);

CREATE UNIQUE INDEX uq_age_split_sections_order
  ON age_split_sections (event_id, start_id, format_id, gender, sort_order);
CREATE INDEX idx_age_split_sections_event_id
  ON age_split_sections (event_id);

COMMIT;
