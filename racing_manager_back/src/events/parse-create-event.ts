import { BadRequestException } from '@nestjs/common';

const EVENT_TYPES = ['RACE', 'TIME_TRIAL'] as const;
const SPORTS = ['RUN', 'SKI', 'ROLLER_SKI', 'BIKE'] as const;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export type EventTypeCode = (typeof EVENT_TYPES)[number];
export type SportCode = (typeof SPORTS)[number];

export type ParsedCreateEvent = {
  name: string;
  eventType: EventTypeCode;
  sport: SportCode;
  eventDate: Date;
  distanceKm: number | null;
  description: string | null;
  registrationOpen: Date | null;
  registrationClose: Date | null;
};

function isEventType(value: string): value is EventTypeCode {
  return (EVENT_TYPES as readonly string[]).includes(value);
}

function isSport(value: string): value is SportCode {
  return (SPORTS as readonly string[]).includes(value);
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

  const eventTypeRaw = readString(raw.eventType, 'eventType', false) ?? 'RACE';
  if (!isEventType(eventTypeRaw)) {
    throw new BadRequestException('eventType must be RACE or TIME_TRIAL.');
  }

  const sportRaw = readString(raw.sport, 'sport', true);
  if (!sportRaw || !isSport(sportRaw)) {
    throw new BadRequestException(
      'sport must be RUN, SKI, ROLLER_SKI or BIKE.',
    );
  }

  const eventDateRaw = readString(raw.eventDate, 'eventDate', true);
  if (!eventDateRaw) throw new BadRequestException('eventDate is required.');
  const eventDate = parseDateOnly(eventDateRaw, 'eventDate');

  let distanceKm: number | null = null;
  if (
    raw.distanceKm !== undefined &&
    raw.distanceKm !== null &&
    raw.distanceKm !== ''
  ) {
    const numeric =
      typeof raw.distanceKm === 'number'
        ? raw.distanceKm
        : Number(raw.distanceKm);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      throw new BadRequestException(
        'distanceKm must be a number greater than 0.',
      );
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
    eventType: eventTypeRaw,
    sport: sportRaw,
    eventDate,
    distanceKm,
    description,
    registrationOpen,
    registrationClose,
  };
}
