export const RegistrationStatusCode = {
  REGISTERED: 'REGISTERED',
  CONFIRMED: 'CONFIRMED',
  CANCELLED: 'CANCELLED',
  WITHDRAWN: 'WITHDRAWN',
} as const;

export type RegistrationStatusCode =
  (typeof RegistrationStatusCode)[keyof typeof RegistrationStatusCode];

export const ACTIVE_REGISTRATION_STATUSES: RegistrationStatusCode[] = [
  RegistrationStatusCode.REGISTERED,
  RegistrationStatusCode.CONFIRMED,
];
