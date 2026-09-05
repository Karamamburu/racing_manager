export const RoleCode = {
  ADMINISTRATOR: 'ADMINISTRATOR',
  ORGANIZER: 'ORGANIZER',
} as const;

export type RoleCode = (typeof RoleCode)[keyof typeof RoleCode];

export const ADMIN_ROLE_CODES: RoleCode[] = [
  RoleCode.ADMINISTRATOR,
  RoleCode.ORGANIZER,
];
