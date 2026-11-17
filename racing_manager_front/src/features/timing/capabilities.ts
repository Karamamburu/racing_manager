/**
 * The two capability levels of the MANUAL-TIMING surface.
 *
 * AD-9, U-30: the API remains the authority for every route; these helpers only
 * decide which control the surface offers. A `REFEREE` operates the timing of an
 * event — start, capture, complete and quick undo — while `ADMINISTRATOR` alone
 * may correct, rebind, cancel or force-complete, always with a reason. An
 * `ORGANIZER` without `REFEREE` operates nothing.
 */

/** The role that administers timing; the only role allowed a correction. */
const TIMING_ADMIN_ROLE = 'ADMINISTRATOR';

/** The role that operates timing without the administrator corrections. */
const TIMING_OPERATOR_ROLE = 'REFEREE';

function hasRole(roles: string[] | undefined, role: string): boolean {
  return roles !== undefined && roles.includes(role);
}

/**
 * Whether the session may operate timing: `REFEREE` or `ADMINISTRATOR`.
 *
 * The gate covers the surface, the Start control, capture, completion and quick
 * undo. An absent role list — a session that has not loaded — operates nothing.
 */
export function canOperateTiming(roles: string[] | undefined): boolean {
  return (
    hasRole(roles, TIMING_OPERATOR_ROLE) || hasRole(roles, TIMING_ADMIN_ROLE)
  );
}

/**
 * Whether the session may administer timing: `ADMINISTRATOR` only.
 *
 * The gate covers a correction, a pass rebind or cancellation, a pending-finish
 * cancellation, a force-complete, an attempt cancellation and a capture
 * force-release. Administrators also operate timing.
 */
export function canAdministerTiming(roles: string[] | undefined): boolean {
  return hasRole(roles, TIMING_ADMIN_ROLE);
}
