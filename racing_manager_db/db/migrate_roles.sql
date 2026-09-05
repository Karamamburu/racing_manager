-- Incremental patch for an already-initialized Postgres volume.
-- init.sql only runs on the first container start.
--
--   docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < db/migrate_roles.sql

CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);

INSERT INTO roles (code, name) VALUES
  ('ADMINISTRATOR', 'Administrator'),
  ('ORGANIZER', 'Organizer')
ON CONFLICT (code) DO NOTHING;

INSERT INTO tracks (id, name, location_city, description, is_active)
VALUES (
  '3d8f1a62-7c4e-4b91-9e2a-0b6c8d4e1f20',
  'Алёшкино',
  'Москва',
  'Лыжная трасса Алёшкино. Контрольные тренировки и гонки сообщества.',
  true
)
ON CONFLICT (id) DO NOTHING;
