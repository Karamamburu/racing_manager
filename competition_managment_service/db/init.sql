-- ========================================
-- Competition management service DB
-- ========================================

DO $$
BEGIN
  EXECUTE format(
    'ALTER DATABASE %I SET timezone TO %L',
    current_database(),
    'Europe/Moscow'
  );
END
$$;
SET timezone = 'Europe/Moscow';

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================================
-- ENUMS
-- ========================================
CREATE TYPE stage_kind AS ENUM (
  'PROLOGUE',
  'EIGHTHFINAL',
  'QUARTERFINAL',
  'SEMIFINAL',
  'FINAL',
  'FINAL_A',
  'FINAL_B',
  'CUSTOM'
);
CREATE TYPE result_status AS ENUM ('OK', 'DNS', 'DNF', 'DSQ', 'NQ');
CREATE TYPE competition_status AS ENUM ('DRAFT', 'IN_PROGRESS', 'DONE');
CREATE TYPE stage_run_status AS ENUM ('PENDING', 'SEEDED', 'COMPLETED');

-- ========================================
-- FORMAT CATALOG
-- ========================================
CREATE TABLE competition_formats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  format JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========================================
-- COMPETITIONS
-- ========================================
CREATE TABLE competitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT,
  status competition_status NOT NULL DEFAULT 'DRAFT',
  format_id UUID REFERENCES competition_formats(id),
  format_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE competition_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  seed INT NOT NULL,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (competition_id, external_id),
  UNIQUE (competition_id, seed)
);

CREATE TABLE stage_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  stage_id TEXT NOT NULL,
  status stage_run_status NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (competition_id, stage_id)
);

CREATE TABLE stage_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  stage_id TEXT NOT NULL,
  participant_id UUID NOT NULL REFERENCES competition_participants(id) ON DELETE CASCADE,
  seed INT NOT NULL,
  eliminated BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (competition_id, stage_id, participant_id),
  UNIQUE (competition_id, stage_id, seed)
);

CREATE TABLE heats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stage_run_id UUID NOT NULL REFERENCES stage_runs(id) ON DELETE CASCADE,
  heat_number INT NOT NULL,
  UNIQUE (stage_run_id, heat_number)
);

CREATE TABLE heat_slots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  heat_id UUID NOT NULL REFERENCES heats(id) ON DELETE CASCADE,
  position INT NOT NULL,
  participant_id UUID NOT NULL REFERENCES competition_participants(id) ON DELETE CASCADE,
  UNIQUE (heat_id, position),
  UNIQUE (heat_id, participant_id)
);

CREATE TABLE heat_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  heat_slot_id UUID NOT NULL UNIQUE REFERENCES heat_slots(id) ON DELETE CASCADE,
  status result_status NOT NULL,
  place INT
);

CREATE TABLE stage_rankings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stage_run_id UUID NOT NULL REFERENCES stage_runs(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES competition_participants(id) ON DELETE CASCADE,
  rank INT NOT NULL,
  heat_number INT NOT NULL,
  status result_status NOT NULL,
  place INT,
  UNIQUE (stage_run_id, participant_id),
  UNIQUE (stage_run_id, rank)
);

CREATE INDEX competitions_status_idx ON competitions (status);
CREATE INDEX stage_entries_stage_idx ON stage_entries (competition_id, stage_id);

-- ========================================
-- PRESET: knockout-24
-- ========================================
INSERT INTO competition_formats (key, label, description, format)
VALUES (
  'knockout-24',
  'Knockout 24',
  'Prologue (top 50%) → 4×6 quarterfinals (snake, top half) → 2×6 semifinals split into Final A and Final B.',
  $$
  {
    "stages": [
      {
        "id": "prologue",
        "kind": "PROLOGUE",
        "label": "Prologue",
        "heats": { "type": "NONE" },
        "ranking": { "type": "BY_PLACE" },
        "advancement": {
          "type": "ROUTES",
          "routes": [
            {
              "cut": { "type": "TOP_PERCENT", "percent": 50 },
              "toStageId": "qf"
            }
          ]
        }
      },
      {
        "id": "qf",
        "kind": "QUARTERFINAL",
        "label": "1/4 final",
        "heats": {
          "type": "HEATS",
          "heatCount": 4,
          "heatSize": 6,
          "remainder": "BALANCED",
          "seeding": { "type": "SNAKE" }
        },
        "ranking": { "type": "BY_PLACE" },
        "advancement": {
          "type": "ROUTES",
          "routes": [
            {
              "cut": { "type": "TOP_FRACTION", "numerator": 1, "denominator": 2 },
              "toStageId": "sf"
            }
          ]
        }
      },
      {
        "id": "sf",
        "kind": "SEMIFINAL",
        "label": "1/2 final",
        "heats": {
          "type": "HEATS",
          "heatCount": 2,
          "heatSize": 6,
          "remainder": "BALANCED",
          "seeding": { "type": "SNAKE" }
        },
        "ranking": { "type": "BY_PLACE" },
        "advancement": {
          "type": "ROUTES",
          "routes": [
            {
              "cut": { "type": "FIRST_HALF" },
              "toStageId": "final_a"
            },
            {
              "cut": { "type": "SECOND_HALF" },
              "toStageId": "final_b"
            }
          ]
        }
      },
      {
        "id": "final_a",
        "kind": "FINAL_A",
        "label": "Final A",
        "heats": {
          "type": "HEATS",
          "heatCount": 1,
          "remainder": "BALANCED",
          "seeding": { "type": "BY_OVERALL_RANK" }
        },
        "ranking": { "type": "BY_PLACE" },
        "advancement": { "type": "NONE" }
      },
      {
        "id": "final_b",
        "kind": "FINAL_B",
        "label": "Final B",
        "heats": {
          "type": "HEATS",
          "heatCount": 1,
          "remainder": "BALANCED",
          "seeding": { "type": "BY_OVERALL_RANK" }
        },
        "ranking": { "type": "BY_PLACE" },
        "advancement": { "type": "NONE" }
      }
    ]
  }
  $$::jsonb
);
