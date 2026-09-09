import { BadRequestException } from '@nestjs/common';

export type ParsedUpdateRegistration = {
  startNumber: number;
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

export function parseUpdateRegistrationBody(
  body: unknown,
): ParsedUpdateRegistration {
  if (!body || typeof body !== 'object') {
    throw new BadRequestException('Request body must be a JSON object.');
  }

  const raw = body as Record<string, unknown>;
  if (raw.startNumber === undefined) {
    throw new BadRequestException('startNumber is required.');
  }

  return {
    startNumber: parseStartNumber(raw.startNumber),
  };
}
