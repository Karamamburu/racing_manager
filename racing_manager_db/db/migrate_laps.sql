-- Event laps and per-participant split times.
-- Safe to re-run: CREATE TABLE / INDEX IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS event_laps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  lap_number INT NOT NULL CHECK (lap_number > 0),
  distance_km NUMERIC(6, 2) NOT NULL CHECK (distance_km > 0),
  UNIQUE (event_id, lap_number)
);

CREATE TABLE IF NOT EXISTS result_laps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  result_id UUID NOT NULL REFERENCES results(id) ON DELETE CASCADE,
  event_lap_id UUID NOT NULL REFERENCES event_laps(id) ON DELETE CASCADE,
  time_milliseconds INT NOT NULL CHECK (time_milliseconds > 0),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (result_id, event_lap_id)
);

CREATE INDEX IF NOT EXISTS idx_event_laps_event_id ON event_laps(event_id);
CREATE INDEX IF NOT EXISTS idx_result_laps_result_id ON result_laps(result_id);
CREATE INDEX IF NOT EXISTS idx_result_laps_event_lap_id ON result_laps(event_lap_id);
