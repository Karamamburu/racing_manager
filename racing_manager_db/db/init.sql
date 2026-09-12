-- ========================================
-- Racing Manager DB (MVP)
-- ========================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================================
-- ENUMS (MVP only)
-- ========================================
CREATE TYPE sport_type AS ENUM ('RUN', 'SKI', 'ROLLER_SKI', 'BIKE');
CREATE TYPE event_type AS ENUM ('RACE', 'TIME_TRIAL');
CREATE TYPE event_status AS ENUM ('PLANNED', 'DONE', 'CANCELLED');
CREATE TYPE registration_status AS ENUM ('REGISTERED', 'CONFIRMED', 'CANCELLED', 'WITHDRAWN');
CREATE TYPE gender_type AS ENUM ('M', 'F');

-- ========================================
-- USERS
-- ========================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  authentik_id TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  first_name TEXT,
  user_name TEXT UNIQUE NOT NULL,
  last_name TEXT,
  gender gender_type,
  birth_date DATE,
  city TEXT,
  district TEXT,
  team TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========================================
-- ROLES
-- A user without user_roles rows is a regular participant.
-- Assign / revoke roles with SQL only (no admin UI yet).
-- The users row is created on first Authentik login — grant after that.
--
-- Grant:
--   INSERT INTO user_roles (user_id, role_id)
--   SELECT u.id, r.id
--   FROM users u
--   CROSS JOIN roles r
--   WHERE u.email = 'you@example.com'
--     AND r.code = 'ADMINISTRATOR'  -- or ORGANIZER
--   ON CONFLICT DO NOTHING;
--
-- Revoke:
--   DELETE FROM user_roles ur
--   USING users u, roles r
--   WHERE ur.user_id = u.id
--     AND ur.role_id = r.id
--     AND u.email = 'you@example.com'
--     AND r.code = 'ADMINISTRATOR';
-- ========================================
CREATE TABLE roles (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL
);

CREATE TABLE user_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

-- ========================================
-- TRACKS
-- ========================================
CREATE TABLE tracks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  location_city TEXT,
  description TEXT,
  map_link TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========================================
-- EVENTS
-- ========================================
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  event_type event_type NOT NULL DEFAULT 'RACE',
  sport sport_type NOT NULL,
  event_date TIMESTAMPTZ NOT NULL,
  distance_km NUMERIC(6, 2) CHECK (distance_km > 0),
  description TEXT,
  registration_open TIMESTAMPTZ,
  registration_close TIMESTAMPTZ,
  status event_status NOT NULL DEFAULT 'PLANNED',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    registration_open IS NULL
    OR registration_close IS NULL
    OR registration_open <= registration_close
  )
);

-- ========================================
-- EVENT LAPS
-- Planned laps of an event. distance_km is the length of one lap.
-- events.distance_km is the sum of these rows.
-- ========================================
CREATE TABLE event_laps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  lap_number INT NOT NULL CHECK (lap_number > 0),
  distance_km NUMERIC(6, 2) NOT NULL CHECK (distance_km > 0),
  UNIQUE (event_id, lap_number)
);

-- ========================================
-- PARTICIPATION FORMATS
-- Catalog of start styles / equipment classes per sport.
-- RUN and BIKE have no rows: ranking is by gender only.
-- An event enables a subset; the rider picks one at registration.
-- Place is derived per (format, gender), not overall.
-- ========================================
CREATE TABLE participation_formats (
  id SERIAL PRIMARY KEY,
  sport sport_type NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  UNIQUE (sport, code)
);

CREATE TABLE event_formats (
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  format_id INT NOT NULL REFERENCES participation_formats(id),
  PRIMARY KEY (event_id, format_id)
);

-- ========================================
-- REGISTRATIONS
-- Guest registrations have user_id = NULL and store participant fields here.
-- Logged-in users are linked via user_id; participant fields are a snapshot
-- of the form submitted at registration time.
-- start_number is assigned later by a race administrator.
-- format_id is required when the event has participation formats.
-- ========================================
CREATE TABLE registrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  gender gender_type NOT NULL,
  birth_year INT NOT NULL CHECK (birth_year >= 1900 AND birth_year <= 2100),
  city TEXT,
  district TEXT,
  team TEXT,
  format_id INT REFERENCES participation_formats(id),
  start_number INT CHECK (start_number > 0),
  status registration_status NOT NULL DEFAULT 'REGISTERED',
  note TEXT,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========================================
-- RESULTS
-- One finish time per registration. time_milliseconds is the sum
-- of result_laps for events that have laps. Place is derived by
-- sorting complete finish times ascending (fastest first) within
-- each (format_id, gender) classification. A start number must
-- be assigned before a result can be recorded.
-- ========================================
CREATE TABLE results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  registration_id UUID NOT NULL UNIQUE REFERENCES registrations(id) ON DELETE CASCADE,
  time_milliseconds INT NOT NULL CHECK (time_milliseconds > 0),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========================================
-- RESULT LAPS
-- Split time for one planned event lap of one result.
-- ========================================
CREATE TABLE result_laps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  result_id UUID NOT NULL REFERENCES results(id) ON DELETE CASCADE,
  event_lap_id UUID NOT NULL REFERENCES event_laps(id) ON DELETE CASCADE,
  time_milliseconds INT NOT NULL CHECK (time_milliseconds > 0),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (result_id, event_lap_id)
);

-- ========================================
-- INDEXES
-- ========================================
CREATE INDEX idx_users_authentik_id ON users(authentik_id);
CREATE INDEX idx_user_roles_role_id ON user_roles(role_id);
CREATE INDEX idx_events_track_id ON events(track_id);
CREATE INDEX idx_events_date ON events(event_date);
CREATE INDEX idx_events_sport ON events(sport);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_event_laps_event_id ON event_laps(event_id);
CREATE INDEX idx_result_laps_result_id ON result_laps(result_id);
CREATE INDEX idx_result_laps_event_lap_id ON result_laps(event_lap_id);
CREATE INDEX idx_participation_formats_sport ON participation_formats(sport);
CREATE INDEX idx_event_formats_format_id ON event_formats(format_id);
CREATE INDEX idx_registrations_event_id ON registrations(event_id);
CREATE INDEX idx_registrations_user_id ON registrations(user_id);
CREATE INDEX idx_registrations_status ON registrations(status);
CREATE INDEX idx_registrations_format_id ON registrations(format_id);
CREATE UNIQUE INDEX idx_registrations_event_user_active
  ON registrations (event_id, user_id)
  WHERE user_id IS NOT NULL AND status IN ('REGISTERED', 'CONFIRMED');
CREATE UNIQUE INDEX idx_registrations_event_person_active
  ON registrations (
    event_id,
    lower(btrim(first_name)),
    lower(btrim(last_name)),
    birth_year
  )
  WHERE user_id IS NULL AND status IN ('REGISTERED', 'CONFIRMED');
CREATE UNIQUE INDEX idx_registrations_event_start_number
  ON registrations (event_id, start_number)
  WHERE start_number IS NOT NULL;

-- ========================================
-- SEED
-- ========================================
INSERT INTO roles (code, name) VALUES
  ('ADMINISTRATOR', 'Administrator'),
  ('ORGANIZER', 'Organizer');

INSERT INTO tracks (id, name, location_city, description, is_active)
VALUES (
  '3d8f1a62-7c4e-4b91-9e2a-0b6c8d4e1f20',
  'Алёшкино',
  'Москва',
  'Лыжная трасса Алёшкино. Контрольные тренировки и гонки сообщества.',
  true
);

INSERT INTO participation_formats (sport, code, name, sort_order) VALUES
  ('SKI', 'FREESTYLE', 'Свободный стиль', 1),
  ('SKI', 'CLASSIC', 'Классический стиль', 2),
  ('ROLLER_SKI', 'FAST_WHEELS', 'Быстрые колёса', 1),
  ('ROLLER_SKI', 'SLOW_WHEELS', 'Медленные колёса', 2),
  ('ROLLER_SKI', 'CLASSIC', 'Классика', 3),
  ('ROLLER_SKI', 'INLINE', 'Ролики (без палок)', 4);
