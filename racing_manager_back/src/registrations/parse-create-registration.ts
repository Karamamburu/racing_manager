import { BadRequestException } from '@nestjs/common';

const GENDERS = ['M', 'F'] as const;
const MIN_BIRTH_YEAR = 1900;

export type GenderCode = (typeof GENDERS)[number];

export type ParsedCreateRegistration = {
  firstName: string;
  lastName: string;
  gender: GenderCode;
  birthYear: number;
  city: string | null;
  district: string | null;
  team: string | null;
};

type OptionalRegistrationFields = {
  firstName: string | null;
  lastName: string | null;
  gender: GenderCode | null;
  birthYear: number | null;
  city: string | null;
  district: string | null;
  team: string | null;
};

function isGender(value: string): value is GenderCode {
  return (GENDERS as readonly string[]).includes(value);
}

function readString(
  value: unknown,
  field: string,
  required: boolean,
): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) throw new BadRequestException(`${field} is required.`);
    return null;
  }
  if (typeof value !== 'string') {
    throw new BadRequestException(`${field} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    if (required) throw new BadRequestException(`${field} is required.`);
    return null;
  }
  return trimmed;
}

function readBirthYear(value: unknown): number {
  if (value === undefined || value === null || value === '') {
    throw new BadRequestException('birthYear is required.');
  }
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) {
    throw new BadRequestException('birthYear must be an integer.');
  }
  const maxYear = new Date().getUTCFullYear();
  if (numeric < MIN_BIRTH_YEAR || numeric > maxYear) {
    throw new BadRequestException(
      `birthYear must be between ${MIN_BIRTH_YEAR} and ${maxYear}.`,
    );
  }
  return numeric;
}

function readOptionalGender(value: unknown): GenderCode | null {
  const genderRaw = readString(value, 'gender', false);
  if (!genderRaw) return null;
  if (!isGender(genderRaw)) {
    throw new BadRequestException('gender must be M or F.');
  }
  return genderRaw;
}

function optionalBirthYearFromDate(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const year = Number(value.trim().slice(0, 4));
  if (!Number.isFinite(year) || !Number.isInteger(year)) return null;
  return readBirthYear(year);
}

export type RegistrationProfileSource = {
  firstName?: string | null;
  lastName?: string | null;
  gender?: string | null;
  birthDate?: string | null;
  city?: string | null;
  district?: string | null;
  team?: string | null;
};

function fieldsFromProfile(
  profile: RegistrationProfileSource,
): OptionalRegistrationFields {
  return {
    firstName: readString(profile.firstName, 'firstName', false),
    lastName: readString(profile.lastName, 'lastName', false),
    gender: readOptionalGender(profile.gender),
    birthYear: optionalBirthYearFromDate(profile.birthDate),
    city: readString(profile.city, 'city', false),
    district: readString(profile.district, 'district', false),
    team: readString(profile.team, 'team', false),
  };
}

function parseOptionalRegistrationBody(body: unknown): OptionalRegistrationFields {
  if (body === undefined || body === null) {
    return {
      firstName: null,
      lastName: null,
      gender: null,
      birthYear: null,
      city: null,
      district: null,
      team: null,
    };
  }
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Request body must be a JSON object.');
  }

  const raw = body as Record<string, unknown>;
  const birthYearRaw = raw.birthYear;
  const hasBirthYear =
    birthYearRaw !== undefined && birthYearRaw !== null && birthYearRaw !== '';

  return {
    firstName: readString(raw.firstName, 'firstName', false),
    lastName: readString(raw.lastName, 'lastName', false),
    gender: readOptionalGender(raw.gender),
    birthYear: hasBirthYear ? readBirthYear(birthYearRaw) : null,
    city: readString(raw.city, 'city', false),
    district: readString(raw.district, 'district', false),
    team: readString(raw.team, 'team', false),
  };
}

function requireCompleteRegistration(
  fields: OptionalRegistrationFields,
): ParsedCreateRegistration {
  if (!fields.firstName || !fields.lastName) {
    throw new BadRequestException('firstName and lastName are required.');
  }
  if (!fields.gender) {
    throw new BadRequestException('gender must be M or F.');
  }
  if (fields.birthYear == null) {
    throw new BadRequestException('birthYear is required.');
  }
  return {
    firstName: fields.firstName,
    lastName: fields.lastName,
    gender: fields.gender,
    birthYear: fields.birthYear,
    city: fields.city,
    district: fields.district,
    team: fields.team,
  };
}

export function registrationFieldsFromProfile(
  profile: RegistrationProfileSource,
): ParsedCreateRegistration {
  return requireCompleteRegistration(fieldsFromProfile(profile));
}

export function mergeRegistrationFields(
  profile: RegistrationProfileSource,
  body: unknown,
): ParsedCreateRegistration {
  const fromProfile = fieldsFromProfile(profile);
  const fromBody = parseOptionalRegistrationBody(body);
  return requireCompleteRegistration({
    firstName: fromProfile.firstName ?? fromBody.firstName,
    lastName: fromProfile.lastName ?? fromBody.lastName,
    gender: fromProfile.gender ?? fromBody.gender,
    birthYear: fromProfile.birthYear ?? fromBody.birthYear,
    city: fromProfile.city ?? fromBody.city,
    district: fromProfile.district ?? fromBody.district,
    team: fromProfile.team ?? fromBody.team,
  });
}

export function parseCreateRegistrationBody(
  body: unknown,
): ParsedCreateRegistration {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Request body must be a JSON object.');
  }

  const raw = body as Record<string, unknown>;
  const firstName = readString(raw.firstName, 'firstName', true);
  const lastName = readString(raw.lastName, 'lastName', true);
  if (!firstName || !lastName) {
    throw new BadRequestException('firstName and lastName are required.');
  }

  const genderRaw = readString(raw.gender, 'gender', true);
  if (!genderRaw || !isGender(genderRaw)) {
    throw new BadRequestException('gender must be M or F.');
  }

  return {
    firstName,
    lastName,
    gender: genderRaw,
    birthYear: readBirthYear(raw.birthYear),
    city: readString(raw.city, 'city', false),
    district: readString(raw.district, 'district', false),
    team: readString(raw.team, 'team', false),
  };
}
