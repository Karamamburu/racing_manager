import { BadRequestException } from '@nestjs/common';

const GENDERS = ['M', 'F'] as const;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const MIN_BIRTH_YEAR = 1900;
const MAX_NAME_LENGTH = 80;
const MAX_PLACE_LENGTH = 120;

export type GenderCode = (typeof GENDERS)[number];

export type ParsedUpdatePersonal = {
  firstName: string;
  lastName: string;
  gender: GenderCode | null;
  birthDate: Date | null;
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
  maxLength: number,
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
  if (trimmed.length > maxLength) {
    throw new BadRequestException(
      `${field} must be at most ${maxLength} characters.`,
    );
  }
  return trimmed;
}

function parseBirthDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    throw new BadRequestException('birthDate must be a string.');
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!DATE_ONLY.test(trimmed)) {
    throw new BadRequestException('birthDate must be YYYY-MM-DD.');
  }

  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== trimmed
  ) {
    throw new BadRequestException('birthDate is not a valid date.');
  }

  const year = parsed.getUTCFullYear();
  const today = new Date();
  const todayUtc = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  if (year < MIN_BIRTH_YEAR || parsed.getTime() > todayUtc) {
    throw new BadRequestException(
      `birthDate must be between ${MIN_BIRTH_YEAR}-01-01 and today.`,
    );
  }

  return parsed;
}

function parseGender(value: unknown): GenderCode | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    throw new BadRequestException('gender must be a string.');
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!isGender(trimmed)) {
    throw new BadRequestException('gender must be M or F.');
  }
  return trimmed;
}

export function parseUpdatePersonalBody(body: unknown): ParsedUpdatePersonal {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Request body must be a JSON object.');
  }

  const raw = body as Record<string, unknown>;
  const firstName = readString(raw.firstName, 'firstName', true, MAX_NAME_LENGTH);
  const lastName = readString(raw.lastName, 'lastName', true, MAX_NAME_LENGTH);
  if (!firstName || !lastName) {
    throw new BadRequestException('firstName and lastName are required.');
  }

  return {
    firstName,
    lastName,
    gender: parseGender(raw.gender),
    birthDate: parseBirthDate(raw.birthDate),
    city: readString(raw.city, 'city', false, MAX_PLACE_LENGTH),
    district: readString(raw.district, 'district', false, MAX_PLACE_LENGTH),
    team: readString(raw.team, 'team', false, MAX_PLACE_LENGTH),
  };
}
