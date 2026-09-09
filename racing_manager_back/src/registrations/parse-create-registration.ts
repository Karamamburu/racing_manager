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

export function parseCreateRegistrationBody(
  body: unknown,
): ParsedCreateRegistration {
  if (!body || typeof body !== 'object') {
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
