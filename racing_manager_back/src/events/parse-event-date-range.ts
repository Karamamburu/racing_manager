import { BadRequestException } from '@nestjs/common';
import {
  parseMoscowDateTime,
  toMoscowDateOnly,
} from '../time/moscow-time';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export type EventDateRange = {
  from: Date;
  to: Date;
};

function parseBound(value: string, field: string): Date {
  if (DATE_ONLY.test(value)) {
    const parsed = toMoscowDateOnly(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${field} is not a valid date.`);
    }
    return parsed;
  }

  const parsed = parseMoscowDateTime(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`${field} must be an ISO datetime.`);
  }
  return parsed;
}

export function parseEventDateRange(
  fromRaw?: string,
  toRaw?: string,
): EventDateRange | undefined {
  const from = fromRaw?.trim();
  const to = toRaw?.trim();
  if (!from && !to) return undefined;
  if (!from || !to) {
    throw new BadRequestException('from and to are required together.');
  }

  const fromDate = parseBound(from, 'from');
  const toDate = parseBound(to, 'to');
  if (fromDate >= toDate) {
    throw new BadRequestException('from must be earlier than to.');
  }

  return { from: fromDate, to: toDate };
}
