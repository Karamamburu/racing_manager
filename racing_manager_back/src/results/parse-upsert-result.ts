import { BadRequestException } from '@nestjs/common';

const MAX_FINISH_TIME_MS = 24 * 60 * 60 * 1000;

export type ParsedUpsertResult = {
  timeMilliseconds: number;
};

function parseTimeMilliseconds(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric) || numeric <= 0) {
    throw new BadRequestException(
      'timeMilliseconds must be an integer greater than 0.',
    );
  }
  if (numeric > MAX_FINISH_TIME_MS) {
    throw new BadRequestException(
      'timeMilliseconds must be at most 24 hours.',
    );
  }
  return numeric;
}

export function parseUpsertResultBody(body: unknown): ParsedUpsertResult {
  if (!body || typeof body !== 'object') {
    throw new BadRequestException('Request body must be a JSON object.');
  }

  const raw = body as Record<string, unknown>;
  if (raw.timeMilliseconds === undefined) {
    throw new BadRequestException('timeMilliseconds is required.');
  }

  return {
    timeMilliseconds: parseTimeMilliseconds(raw.timeMilliseconds),
  };
}
