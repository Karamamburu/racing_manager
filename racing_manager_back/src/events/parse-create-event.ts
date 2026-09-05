import { BadRequestException } from '@nestjs/common';
import { EventKind, SportType } from '@prisma/client';

const EVENT_TYPES = new Set<string>(Object.values(EventKind));
const SPORTS = new Set<string>(Object.values(SportType));
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export type ParsedCreateEvent = {
  name: string;
  eventType: EventKind;
  sport: SportType;
  eventDate: Date;
  distanceKm: number | null;
  description: string | null;
  registrationOpen: Date | null;
  registrationClose: Date | null;
};

function readString(value: unknown, field: string, required: boolean): string | null {
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

function parseDateOnly(value: string, field: string): Date {
  if (!DATE_ONLY.test(value)) {
    throw new BadRequestException(`${field} must be YYYY-MM-DD.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`${field} is not a valid date.`);
  }
  return parsed;
}

function parseDateTime(value: string, field: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`${field} must be an ISO datetime.`);
  }
  return parsed;
}

export function parseCreateEventBody(body: unknown): ParsedCreateEvent {
  if (!body || typeof body !== 'object') {
    throw new BadRequestException('Request body must be a JSON object.');
  }

  const raw = body as Record<string, unknown>;
  const name = readString(raw.name, 'name', true);
  if (!name) throw new BadRequestException('name is required.');

  const eventTypeRaw = readString(raw.eventType, 'eventType', false) ?? EventKind.RACE;
  if (!EVENT_TYPES.has(eventTypeRaw)) {
    throw new BadRequestException('eventType must be RACE or TIME_TRIAL.');
  }

  const sportRaw = readString(raw.sport, 'sport', true);
  if (!sportRaw || !SPORTS.has(sportRaw)) {
    throw new BadRequestException(
      'sport must be RUN, SKI, ROLLER_SKI or BIKE.',
    );
  }

  const eventDateRaw = readString(raw.eventDate, 'eventDate', true);
  if (!eventDateRaw) throw new BadRequestException('eventDate is required.');
  const eventDate = parseDateOnly(eventDateRaw, 'eventDate');

  let distanceKm: number | null = null;
  if (raw.distanceKm !== undefined && raw.distanceKm !== null && raw.distanceKm !== '') {
    const numeric =
      typeof raw.distanceKm === 'number'
        ? raw.distanceKm
        : Number(raw.distanceKm);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      throw new BadRequestException('distanceKm must be a number greater than 0.');
    }
    distanceKm = numeric;
  }

  const description = readString(raw.description, 'description', false);

  const registrationOpenRaw = readString(
    raw.registrationOpen,
    'registrationOpen',
    false,
  );
  const registrationCloseRaw = readString(
    raw.registrationClose,
    'registrationClose',
    false,
  );
  const registrationOpen = registrationOpenRaw
    ? parseDateTime(registrationOpenRaw, 'registrationOpen')
    : null;
  const registrationClose = registrationCloseRaw
    ? parseDateTime(registrationCloseRaw, 'registrationClose')
    : null;

  if (
    registrationOpen &&
    registrationClose &&
    registrationOpen.getTime() > registrationClose.getTime()
  ) {
    throw new BadRequestException(
      'registrationOpen must be before or equal to registrationClose.',
    );
  }

  return {
    name,
    eventType: eventTypeRaw as EventKind,
    sport: sportRaw as SportType,
    eventDate,
    distanceKm,
    description,
    registrationOpen,
    registrationClose,
  };
}
