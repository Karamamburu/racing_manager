export const RegistrationStatusCode = {
  REGISTERED: 'REGISTERED',
  CONFIRMED: 'CONFIRMED',
  CANCELLED: 'CANCELLED',
  WITHDRAWN: 'WITHDRAWN',
  DNS: 'DNS',
  DNF: 'DNF',
  QQ: 'QQ',
  NQ: 'NQ',
  DSQ: 'DSQ',
  FINISHED: 'FINISHED',
} as const;

export type RegistrationStatusCode =
  (typeof RegistrationStatusCode)[keyof typeof RegistrationStatusCode];

export const REGISTRATION_STATUSES = [
  RegistrationStatusCode.REGISTERED,
  RegistrationStatusCode.CONFIRMED,
  RegistrationStatusCode.CANCELLED,
  RegistrationStatusCode.WITHDRAWN,
  RegistrationStatusCode.DNS,
  RegistrationStatusCode.DNF,
  RegistrationStatusCode.QQ,
  RegistrationStatusCode.NQ,
  RegistrationStatusCode.DSQ,
  RegistrationStatusCode.FINISHED,
] as const;

export const ACTIVE_REGISTRATION_STATUSES: RegistrationStatusCode[] = [
  RegistrationStatusCode.REGISTERED,
  RegistrationStatusCode.CONFIRMED,
];

export const LISTED_REGISTRATION_STATUSES: RegistrationStatusCode[] = [
  RegistrationStatusCode.REGISTERED,
  RegistrationStatusCode.CONFIRMED,
  RegistrationStatusCode.DNS,
  RegistrationStatusCode.DNF,
  RegistrationStatusCode.QQ,
  RegistrationStatusCode.NQ,
  RegistrationStatusCode.DSQ,
  RegistrationStatusCode.FINISHED,
];

export const MANAGEABLE_REGISTRATION_STATUSES: RegistrationStatusCode[] = [
  RegistrationStatusCode.REGISTERED,
  RegistrationStatusCode.CONFIRMED,
  RegistrationStatusCode.DNS,
  RegistrationStatusCode.DNF,
  RegistrationStatusCode.QQ,
  RegistrationStatusCode.NQ,
  RegistrationStatusCode.DSQ,
  RegistrationStatusCode.CANCELLED,
];

export const UNRANKED_REGISTRATION_STATUSES: RegistrationStatusCode[] = [
  RegistrationStatusCode.DNS,
  RegistrationStatusCode.DNF,
  RegistrationStatusCode.DSQ,
  RegistrationStatusCode.NQ,
  RegistrationStatusCode.CANCELLED,
  RegistrationStatusCode.WITHDRAWN,
];

export function isRegistrationStatus(
  value: string,
): value is RegistrationStatusCode {
  return (REGISTRATION_STATUSES as readonly string[]).includes(value);
}

export function isActiveRegistrationStatus(status: string): boolean {
  return (ACTIVE_REGISTRATION_STATUSES as string[]).includes(status);
}

export function isListedRegistrationStatus(status: string): boolean {
  return (LISTED_REGISTRATION_STATUSES as string[]).includes(status);
}

export function isManageableRegistrationStatus(
  status: string,
): status is RegistrationStatusCode {
  return (MANAGEABLE_REGISTRATION_STATUSES as string[]).includes(status);
}

export function isRankedRegistrationStatus(status: string): boolean {
  return !(UNRANKED_REGISTRATION_STATUSES as string[]).includes(status);
}

export function isRecordableRegistrationStatus(status: string): boolean {
  return (
    status === RegistrationStatusCode.CONFIRMED ||
    status === RegistrationStatusCode.DNF ||
    status === RegistrationStatusCode.QQ ||
    status === RegistrationStatusCode.NQ ||
    status === RegistrationStatusCode.DSQ ||
    status === RegistrationStatusCode.REGISTERED
  );
}

export function clearsRegistrationOnStatus(status: string): boolean {
  return (
    status === RegistrationStatusCode.CANCELLED ||
    status === RegistrationStatusCode.WITHDRAWN
  );
}

