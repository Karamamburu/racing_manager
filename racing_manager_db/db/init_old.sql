-- =========================
-- EXTENSIONS
-- =========================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =========================
-- ENUMS
-- =========================
CREATE TYPE gender_type AS ENUM ('M', 'F');

CREATE TYPE sport_type AS ENUM ('SKI', 'RUN', 'ROLLER_SKI');

CREATE TYPE race_status AS ENUM ('PLANNED', 'DONE', 'CANCELLED');

CREATE TYPE registration_status AS ENUM ('CONFIRMED', 'DNS', 'CANCELLED', 'READY', 'QQ');

CREATE TYPE stile_type AS ENUM ('CLASSIC', 'FREESTYLE', 'ROAD', 'TRAIL', 'TRACK');

CREATE TYPE race_types AS ENUM ('SPRINT', 'DISTANCE', 'MARATHON');

CREATE TYPE result_status AS ENUM ('FINISHED', 'DNF', 'DSQ');

CREATE TYPE event_type AS ENUM ('RACE', 'GROUP_TRAINING', 'TIME_TRIAL');

-- =========================
-- USERS
-- =========================
CREATE TABLE
  users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    authentik_id TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    first_name TEXT,
    last_name TEXT,
    gender gender_type,
    birth_year INT CHECK (
      birth_year BETWEEN 1900 AND EXTRACT(
        YEAR
        FROM
          now ()
      )
    ),
    city TEXT,
    district TEXT,
    team TEXT,
    created_at TIMESTAMPTZ DEFAULT now (),
    last_login_at TIMESTAMPTZ
  );

-- =========================
-- ROLES
-- =========================
CREATE TABLE
  roles (
    id SERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL
  );

-- =========================
-- USER ROLES
-- =========================
CREATE TABLE
  user_roles (
    user_id UUID REFERENCES users (id) ON DELETE CASCADE,
    role_id INT REFERENCES roles (id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
  );

-- =========================
-- TRACKS (трассы)
-- =========================
CREATE TABLE
  tracks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    name TEXT NOT NULL,
    max_lap_distance NUMERIC(5, 2) NOT NULL,
    elevation_gain INT,
    location_city TEXT,
    location_district TEXT,
    description TEXT,
    map_link TEXT,
    is_active BOOLEAN DEFAULT true
  );

-- =========================
-- TRACK ADMINS (администраторы трасс)
-- =========================
CREATE TABLE 
  track_admins (
    track_id UUID REFERENCES tracks(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (track_id, user_id)
);

-- =========================
-- ROLLER SKI WHEELS (типы колёс лыжероллеров)
-- =========================
CREATE TABLE 
  roller_ski_wheels (
    id SERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    speed_index INT 
  );

-- =========================
-- EVENTS (мероприятия)
-- =========================
CREATE TABLE
  events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    track_id UUID REFERENCES tracks (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    event_type event_type NOT NULL DEFAULT 'RACE',
    race_type race_types,
    event_date DATE NOT NULL,
    distance_km NUMERIC(5, 2),
    map_link TEXT,
    sport sport_type DEFAULT 'SKI' NOT NULL,
    wheel_type_id INT REFERENCES roller_ski_wheels(id),
    style stile_type DEFAULT 'FREESTYLE' NOT NULL,
    min_participants_count INT,
    max_participants_count INT,
    registration_open TIMESTAMPTZ,
    registration_close TIMESTAMPTZ,
    status race_status DEFAULT 'PLANNED',
    created_by UUID REFERENCES users (id),
    created_at TIMESTAMPTZ DEFAULT now (),

    CONSTRAINT chk_event_type_race_type CHECK (
    (event_type = 'RACE' AND race_type IS NOT NULL)
    OR
    (event_type <> 'RACE' AND race_type IS NULL)
  ),
    CONSTRAINT chk_wheel_type CHECK (
      (sport = 'ROLLER_SKI' AND wheel_type_id IS NOT NULL)
      OR
      (sport <> 'ROLLER_SKI' AND wheel_type_id IS NULL)
    )
  );

-- =========================
-- REGISTRATIONS (заявки)
-- =========================
CREATE TABLE
  registrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    event_id UUID REFERENCES events (id) ON DELETE CASCADE,
    user_id UUID REFERENCES users (id) ON DELETE CASCADE,
    bib_number INT,
    registered_at TIMESTAMPTZ DEFAULT now (),
    status registration_status DEFAULT 'CONFIRMED',
    UNIQUE (event_id, user_id),
    UNIQUE (event_id, bib_number)
  );

-- =========================
-- RESULTS (результаты)
-- =========================
CREATE TABLE
  results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    event_id UUID REFERENCES events (id) ON DELETE CASCADE,
    user_id UUID REFERENCES users (id) ON DELETE CASCADE,
    time_milliseconds INT CHECK (time_milliseconds > 0),
    place INT CHECK (place > 0),
    status result_status DEFAULT 'FINISHED',
    UNIQUE (event_id, user_id)
  );

-- =========================
-- CUP SEASONS
-- =========================
CREATE TABLE
  cup_seasons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    name TEXT NOT NULL,
    start_date DATE,
    end_date DATE
  );

-- =========================
-- RACE -> CUP SEASON LINK
-- =========================
CREATE TABLE
  race_cup_season (
    event_id UUID REFERENCES events (id) ON DELETE CASCADE,
    season_id UUID REFERENCES cup_seasons (id) ON DELETE CASCADE,
    PRIMARY KEY (event_id, season_id)
  );

-- =========================
-- RACE POINTS (начисленные очки)
-- =========================
CREATE TABLE
  race_points (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    event_id UUID REFERENCES events (id) ON DELETE CASCADE,
    user_id UUID REFERENCES users (id) ON DELETE CASCADE,
    season_id UUID REFERENCES cup_seasons (id) ON DELETE CASCADE,
    place INT CHECK (place > 0),
    points INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now (),
    UNIQUE (event_id, user_id)
  );

-- =========================
-- INDEXES
-- =========================
CREATE INDEX idx_events_track_id ON events (track_id);

CREATE INDEX idx_events_date ON events (event_date);

CREATE INDEX idx_events_status ON events (status);

CREATE INDEX idx_registrations_event_id ON registrations (event_id);

CREATE INDEX idx_registrations_user_id ON registrations (user_id);

CREATE INDEX idx_results_event_id ON results (event_id);

CREATE INDEX idx_results_user_id ON results (user_id);

CREATE INDEX idx_users_id ON users (id);

CREATE INDEX idx_users_email ON users (email);

CREATE INDEX idx_users_last_name ON users (last_name);

CREATE INDEX idx_users_first_name ON users (first_name);

CREATE INDEX idx_race_points_user_id ON race_points (user_id);

CREATE INDEX idx_race_points_season_id ON race_points (season_id);

CREATE INDEX idx_race_points_event_id ON race_points (event_id);

-- =========================
-- SEED DATA (roles)
-- =========================
INSERT INTO
  roles (code, name)
VALUES
  ('ADMINISTRATOR', 'Administrator'),
  ('ORGANIZER', 'Organizer'),
  ('TRACK_LEADER', 'Track Leader'),
  ('JUDGE', 'Judge'),
  ('TECHNICIAN', 'Technician'),
  ('RENT_MANAGER', 'Rent Manager');