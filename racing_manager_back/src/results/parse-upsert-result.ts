import { BadRequestException } from '@nestjs/common';

const MAX_FINISH_TIME_MS = 24 * 60 * 60 * 1000;
const OUTCOMES = ['FINISHED', 'DNS', 'DNF', 'DSQ'] as const;

export type ResultOutcomeCode = (typeof OUTCOMES)[number];

export type ParsedUpsertResult = {
  outcome: ResultOutcomeCode;
  timeMilliseconds: number | null;
};

function parseTimeMilliseconds(
  value: unknown,
  field = 'timeMilliseconds',
): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric) || numeric <= 0) {
    throw new BadRequestException(
      `${field} must be an integer greater than 0.`,
    );
  }
  if (numeric > MAX_FINISH_TIME_MS) {
    throw new BadRequestException(`${field} must be at most 24 hours.`);
  }
  return numeric;
}

function parseOutcome(value: unknown): ResultOutcomeCode {
  if (
    typeof value !== 'string' ||
    !(OUTCOMES as readonly string[]).includes(value)
  ) {
    throw new BadRequestException('outcome must be FINISHED, DNS, DNF or DSQ.');
  }
  return value as ResultOutcomeCode;
}

/**
 * `UpsertEnrollmentResultDto`. Distance laps are distance configuration only;
 * per-lap result arrays belong to MANUAL-TIMING and are rejected here.
 */
export function parseUpsertResultBody(body: unknown): ParsedUpsertResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Request body must be a JSON object.');
  }

  const raw = body as Record<string, unknown>;
  if (raw.laps !== undefined && raw.laps !== null) {
    throw new BadRequestException(
      'laps are not supported for enrollment results.',
    );
  }

  const outcome = parseOutcome(raw.outcome);
  if (outcome === 'FINISHED') {
    if (raw.timeMilliseconds === undefined) {
      throw new BadRequestException(
        'timeMilliseconds is required for FINISHED.',
      );
    }
    return {
      outcome,
      timeMilliseconds: parseTimeMilliseconds(raw.timeMilliseconds),
    };
  }

  if (raw.timeMilliseconds !== undefined && raw.timeMilliseconds !== null) {
    throw new BadRequestException(
      'timeMilliseconds must not be sent for DNS, DNF or DSQ.',
    );
  }
  return { outcome, timeMilliseconds: null };
}
