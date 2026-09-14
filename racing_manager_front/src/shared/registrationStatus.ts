export const RegistrationStatusCode = {
  REGISTERED: 'REGISTERED',
  CONFIRMED: 'CONFIRMED',
  CANCELLED: 'CANCELLED',
  WITHDRAWN: 'WITHDRAWN',
  DNS: 'DNS',
  DNF: 'DNF',
  QQ: 'QQ',
  DSQ: 'DSQ',
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
  RegistrationStatusCode.DSQ,
] as const;

export const MANAGEABLE_REGISTRATION_STATUSES = [
  RegistrationStatusCode.REGISTERED,
  RegistrationStatusCode.CONFIRMED,
  RegistrationStatusCode.DNS,
  RegistrationStatusCode.DNF,
  RegistrationStatusCode.QQ,
  RegistrationStatusCode.DSQ,
  RegistrationStatusCode.CANCELLED,
] as const;

export type RegistrationStatusMeta = {
  text: string;
  color: string;
};

export const REGISTRATION_STATUS_META: Record<
  RegistrationStatusCode,
  RegistrationStatusMeta
> = {
  REGISTERED: { text: 'Зарегистрирована', color: 'blue' },
  CONFIRMED: { text: 'Подтверждена', color: 'green' },
  CANCELLED: { text: 'Отменена', color: 'red' },
  WITHDRAWN: { text: 'Отозвана', color: 'default' },
  DNS: { text: 'DNS — не стартовал', color: 'default' },
  DNF: { text: 'DNF — не финишировал', color: 'orange' },
  QQ: { text: 'QQ — квалифицирован в следующий раунд', color: 'cyan' },
  DSQ: { text: 'DSQ — дисквалифицирован', color: 'magenta' },
};

export function isRegistrationStatus(value: string): value is RegistrationStatusCode {
  return (REGISTRATION_STATUSES as readonly string[]).includes(value);
}

export function isActiveRegistrationStatus(status: string): boolean {
  return status === 'REGISTERED' || status === 'CONFIRMED';
}

export function isRecordableRegistrationStatus(status: string): boolean {
  return (
    status === 'REGISTERED' ||
    status === 'CONFIRMED' ||
    status === 'DNF' ||
    status === 'QQ' ||
    status === 'DSQ'
  );
}

export function registrationStatusMeta(status: string): RegistrationStatusMeta {
  if (isRegistrationStatus(status)) return REGISTRATION_STATUS_META[status];
  return { text: status, color: 'default' };
}
