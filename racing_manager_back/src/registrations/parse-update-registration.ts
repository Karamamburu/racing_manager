import { BadRequestException } from '@nestjs/common';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ParsedEnrollmentInput = {
  startId: string;
  formatId: number;
};

export type ParsedUpdateRegistration = {
  startNumber?: number;
  enrollments?: ParsedEnrollmentInput[];
};

function parseStartNumber(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric) || numeric <= 0) {
    throw new BadRequestException(
      'startNumber must be an integer greater than 0.',
    );
  }
  return numeric;
}

function parseEnrollments(value: unknown): ParsedEnrollmentInput[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new BadRequestException('enrollments must be a non-empty array.');
  }

  const enrollments: ParsedEnrollmentInput[] = [];
  const startIds = new Set<string>();

  for (let index = 0; index < value.length; index += 1) {
    const item: unknown = value[index];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new BadRequestException(`enrollments[${index}] must be an object.`);
    }

    const field = `enrollments[${index}]`;
    const raw = item as Record<string, unknown>;
    if (typeof raw.startId !== 'string' || !UUID.test(raw.startId)) {
      throw new BadRequestException(`${field}.startId must be a UUID.`);
    }
    if (startIds.has(raw.startId)) {
      throw new BadRequestException(`${field}.startId must be unique.`);
    }
    startIds.add(raw.startId);

    const formatId =
      typeof raw.formatId === 'number' ? raw.formatId : Number(raw.formatId);
    if (!Number.isInteger(formatId) || formatId <= 0) {
      throw new BadRequestException(
        `${field}.formatId must be a positive integer.`,
      );
    }

    enrollments.push({ startId: raw.startId, formatId });
  }

  return enrollments;
}

export function parseUpdateRegistrationBody(
  body: unknown,
): ParsedUpdateRegistration {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Request body must be a JSON object.');
  }

  const raw = body as Record<string, unknown>;
  const parsed: ParsedUpdateRegistration = {};

  if (raw.startNumber !== undefined) {
    parsed.startNumber = parseStartNumber(raw.startNumber);
  }
  if (Object.hasOwn(raw, 'enrollments') && raw.enrollments !== undefined) {
    parsed.enrollments = parseEnrollments(raw.enrollments);
  }

  return parsed;
}
