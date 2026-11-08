import { BadRequestException } from '@nestjs/common';
import { parseStartInputs, type ParsedStartInput } from './parse-create-event';

export type ParsedUpdateEvent = {
  starts?: ParsedStartInput[];
};

export function parseUpdateEventBody(body: unknown): ParsedUpdateEvent {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Request body must be a JSON object.');
  }

  const raw = body as Record<string, unknown>;
  if (!Object.hasOwn(raw, 'starts') || raw.starts === undefined) {
    return {};
  }

  return { starts: parseStartInputs(raw.starts) };
}
