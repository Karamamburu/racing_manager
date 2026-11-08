-- UI-POLISH-3: optional route colour per start.
-- Additive; no HTTP behaviour change in this patch.

BEGIN;

CREATE TYPE start_route_color AS ENUM (
  'BLUE',
  'ORANGE',
  'CYAN',
  'RED',
  'MAGENTA',
  'YELLOW'
);

ALTER TABLE starts ADD COLUMN route_color start_route_color;

COMMIT;
