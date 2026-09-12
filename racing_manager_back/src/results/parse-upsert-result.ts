import { BadRequestException } from '@nestjs/common';

const MAX_FINISH_TIME_MS = 24 * 60 * 60 * 1000;
const MAX_LAP_COUNT = 50;

export type ParsedResultLap = {
  lapNumber: number;
  timeMilliseconds: number;
};

export type ParsedUpsertResult =
  | { mode: 'total'; timeMilliseconds: number }
  | { mode: 'laps'; laps: ParsedResultLap[] };

function parseTimeMilliseconds(value: unknown, field = 'timeMilliseconds'): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric) || numeric <= 0) {
    throw new BadRequestException(
      `${field} must be an integer greater than 0.`,
    );
  }
  if (numeric > MAX_FINISH_TIME_MS) {
    throw new BadRequestException(
      `${field} must be at most 24 hours.`,
    );
  }
  return numeric;
}

function parseResultLaps(value: unknown): ParsedResultLap[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new BadRequestException('laps must be a non-empty array.');
  }
  if (value.length > MAX_LAP_COUNT) {
    throw new BadRequestException(
      `laps must contain at most ${MAX_LAP_COUNT} items.`,
    );
  }

  const laps: ParsedResultLap[] = [];
  const seen = new Set<number>();
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (!item || typeof item !== 'object') {
      throw new BadRequestException(
        'laps items must be objects with lapNumber and timeMilliseconds.',
      );
    }
    const raw = item as Record<string, unknown>;
    const lapNumberRaw =
      typeof raw.lapNumber === 'number' ? raw.lapNumber : Number(raw.lapNumber);
    if (!Number.isInteger(lapNumberRaw) || lapNumberRaw <= 0) {
      throw new BadRequestException(
        `laps[${index}].lapNumber must be a positive integer.`,
      );
    }
    if (seen.has(lapNumberRaw)) {
      throw new BadRequestException('laps must not contain duplicate lapNumber values.');
    }
    seen.add(lapNumberRaw);
    if (raw.timeMilliseconds === undefined) {
      throw new BadRequestException(
        `laps[${index}].timeMilliseconds is required.`,
      );
    }
    laps.push({
      lapNumber: lapNumberRaw,
      timeMilliseconds: parseTimeMilliseconds(
        raw.timeMilliseconds,
        `laps[${index}].timeMilliseconds`,
      ),
    });
  }
  return laps;
}

export function parseUpsertResultBody(body: unknown): ParsedUpsertResult {
  if (!body || typeof body !== 'object') {
    throw new BadRequestException('Request body must be a JSON object.');
  }

  const raw = body as Record<string, unknown>;
  if (raw.laps !== undefined && raw.laps !== null) {
    return { mode: 'laps', laps: parseResultLaps(raw.laps) };
  }
  if (raw.timeMilliseconds === undefined) {
    throw new BadRequestException('laps or timeMilliseconds is required.');
  }

  return {
    mode: 'total',
    timeMilliseconds: parseTimeMilliseconds(raw.timeMilliseconds),
  };
}
