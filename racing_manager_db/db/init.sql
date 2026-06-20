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
CREATE TYPE registration_status AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');

-- ========================================
-- USERS
-- ========================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  authentik_id TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE,
  first_name TEXT,
  user_name TEXT,
  last_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
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
  event_date DATE NOT NULL,
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
-- REGISTRATIONS
-- ========================================
CREATE TABLE registrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status registration_status NOT NULL DEFAULT 'PENDING',
  note TEXT,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

-- ========================================
-- INDEXES
-- ========================================
CREATE INDEX idx_users_authentik_id ON users(authentik_id);
CREATE INDEX idx_events_track_id ON events(track_id);
CREATE INDEX idx_events_date ON events(event_date);
CREATE INDEX idx_events_sport ON events(sport);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_registrations_event_id ON registrations(event_id);
CREATE INDEX idx_registrations_user_id ON registrations(user_id);
CREATE INDEX idx_registrations_status ON registrations(status);
