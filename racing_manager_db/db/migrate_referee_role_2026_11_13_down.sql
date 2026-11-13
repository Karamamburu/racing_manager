-- MANUAL-TIMING rollback: remove the REFEREE role seeded by
-- migrate_referee_role_2026_11_13.sql.
--
-- The delete is a no-op while any user_roles row still references the role,
-- so a rollback cannot break a live grant. Revoke the grants first, then run
-- this file again.
-- A fresh database keeps its init.sql seed; this file only owns the patch.
-- No row is deleted from any Prisma migration bookkeeping table.

BEGIN;

DELETE FROM roles
WHERE code = 'REFEREE'
  AND NOT EXISTS (
    SELECT 1 FROM user_roles ur WHERE ur.role_id = roles.id
  );

COMMIT;
