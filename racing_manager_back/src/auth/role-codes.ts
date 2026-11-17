export const RoleCode = {
  ADMINISTRATOR: 'ADMINISTRATOR',
  ORGANIZER: 'ORGANIZER',
  REFEREE: 'REFEREE',
} as const;

export type RoleCode = (typeof RoleCode)[keyof typeof RoleCode];

export const ADMIN_ROLE_CODES: RoleCode[] = [
  RoleCode.ADMINISTRATOR,
  RoleCode.ORGANIZER,
];

export const TIMING_OPERATE_ROLE_CODES: RoleCode[] = [
  RoleCode.REFEREE,
  RoleCode.ADMINISTRATOR,
];
