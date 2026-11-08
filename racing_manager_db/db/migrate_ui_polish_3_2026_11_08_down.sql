-- UI-POLISH-3 rollback: route colour per start.

BEGIN;

ALTER TABLE starts DROP COLUMN IF EXISTS route_color;
DROP TYPE IF EXISTS start_route_color;

COMMIT;
