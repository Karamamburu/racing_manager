-- MANUAL-TIMING: seed the global REFEREE role.
-- Additive and idempotent: a fresh database already receives REFEREE from
-- init.sql, so applying this patch once, twice, or after a fresh init is safe
-- and always leaves exactly one row.
-- No user_roles row is written here: the role is granted later through
-- PATCH /admin/users/:userId/referee-role (T9) or by hand.
-- Paired rollback: migrate_referee_role_2026_11_13_down.sql.
-- Apply on a disposable DB first; verify the paired *_down.sql before
-- production.

BEGIN;

INSERT INTO roles (code, name) VALUES ('REFEREE', 'Referee')
ON CONFLICT (code) DO NOTHING;

COMMIT;
