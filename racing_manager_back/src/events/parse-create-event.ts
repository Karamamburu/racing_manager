import { BadRequestException } from '@nestjs/common';
import {
  parseMoscowDateTime,
  toMoscowDateOnly,
} from '../time/moscow-time';

const EVENT_TYPES = ['RACE', 'TIME_TRIAL'] as const;
const SPORTS = ['RUN', 'SKI', 'ROLLER_SKI', 'BIKE'] as const;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_LAP_COUNT = 50;
const MAX_DISTANCE_KM = 9999.99;

export type EventTypeCode = (typeof EVENT_TYPES)[number];
export type SportCode = (typeof SPORTS)[number];

export type ParsedEventLap = {
  lapNumber: number;
  distanceKm: number;
};

export type ParsedCreateEvent = {
  name: string;
  eventType: EventTypeCode;
  sport: SportCode;
  eventDate: Date;
  distanceKm: number;
  description: string | null;
  registrationOpen: Date | null;
  registrationClose: Date | null;
  formatIds: number[];
  laps: ParsedEventLap[];
};

function isEventType(value: string): value is EventTypeCode {
  return (EVENT_TYPES as readonly string[]).includes(value);
}

export function isSport(value: string): value is SportCode {
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
  const parsed = toMoscowDateOnly(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`${field} is not a valid date.`);
  }
  return parsed;
}

function parseDateTime(value: string, field: string): Date {
  const parsed = parseMoscowDateTime(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`${field} must be an ISO datetime.`);
  }
  return parsed;
}

function parsePositiveDistance(value: unknown, field: string): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new BadRequestException(`${field} must be a number greater than 0.`);
  }
  if (numeric > MAX_DISTANCE_KM) {
    throw new BadRequestException(
      `${field} must be at most ${MAX_DISTANCE_KM}.`,
    );
  }
  return numeric;
}

function parseLaps(value: unknown): ParsedEventLap[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new BadRequestException('laps must be a non-empty array.');
  }
  if (value.length > MAX_LAP_COUNT) {
    throw new BadRequestException(
      `laps must contain at most ${MAX_LAP_COUNT} items.`,
    );
  }

  const laps: ParsedEventLap[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (!item || typeof item !== 'object') {
      throw new BadRequestException(
        'laps items must be objects with lapNumber and distanceKm.',
      );
    }
    const raw = item as Record<string, unknown>;
    const expectedNumber = index + 1;
    const lapNumberRaw =
      raw.lapNumber === undefined ? expectedNumber : raw.lapNumber;
    const lapNumber =
      typeof lapNumberRaw === 'number' ? lapNumberRaw : Number(lapNumberRaw);
    if (!Number.isInteger(lapNumber) || lapNumber !== expectedNumber) {
      throw new BadRequestException(
        'laps must be numbered consecutively starting from 1.',
      );
    }
    if (raw.distanceKm === undefined || raw.distanceKm === null) {
      throw new BadRequestException(
        `laps[${index}].distanceKm is required.`,
      );
    }
    laps.push({
      lapNumber,
      distanceKm: parsePositiveDistance(
        raw.distanceKm,
        `laps[${index}].distanceKm`,
      ),
    });
  }
  return laps;
}

function parseFormatIds(value: unknown): number[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new BadRequestException(
      'formatIds must be an array of positive integers.',
    );
  }
  const ids: number[] = [];
  for (const item of value) {
    const numeric = typeof item === 'number' ? item : Number(item);
    if (!Number.isInteger(numeric) || numeric <= 0) {
      throw new BadRequestException(
        'formatIds must be an array of positive integers.',
      );
    }
    if (!ids.includes(numeric)) ids.push(numeric);
  }
  return ids;
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
  const eventDate = DATE_ONLY.test(eventDateRaw)
    ? parseDateOnly(eventDateRaw, 'eventDate')
    : parseDateTime(eventDateRaw, 'eventDate');

  if (raw.laps === undefined || raw.laps === null) {
    throw new BadRequestException('laps is required.');
  }
  const laps = parseLaps(raw.laps);
  const distanceKm = Number(
    laps.reduce((sum, lap) => sum + lap.distanceKm, 0).toFixed(2),
  );
  if (distanceKm > MAX_DISTANCE_KM) {
    throw new BadRequestException(
      `Total distance must be at most ${MAX_DISTANCE_KM} km.`,
    );
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
    formatIds: parseFormatIds(raw.formatIds),
    laps,
  };
}
