import { MOSCOW_TIME_ZONE } from '../time/moscow-time';

export const EVENT_TIME_ZONE = MOSCOW_TIME_ZONE;

export const EventStatusCode = {
  PLANNED: 'PLANNED',
  IN_PROGRESS: 'IN_PROGRESS',
  DONE: 'DONE',
  CANCELLED: 'CANCELLED',
} as const;

export type EventStatusCode =
  (typeof EventStatusCode)[keyof typeof EventStatusCode];

export const EVENT_STATUSES = [
  EventStatusCode.PLANNED,
  EventStatusCode.IN_PROGRESS,
  EventStatusCode.DONE,
  EventStatusCode.CANCELLED,
] as const;

export const AUTO_EVENT_STATUSES = [
  EventStatusCode.PLANNED,
  EventStatusCode.IN_PROGRESS,
] as const;

export function isEventStatus(value: string): value is EventStatusCode {
  return (EVENT_STATUSES as readonly string[]).includes(value);
}

export function toEventIsoDate(
  date: Date,
  timeZone = EVENT_TIME_ZONE,
): string {
  return date.toLocaleDateString('en-CA', { timeZone });
}

export function dueEventStatus(
  eventDate: Date,
  now = new Date(),
): Exclude<EventStatusCode, 'CANCELLED'> {
  const today = toEventIsoDate(now);
  const start = toEventIsoDate(eventDate);
  if (start < today) return EventStatusCode.DONE;
  if (start === today) return EventStatusCode.IN_PROGRESS;
  return EventStatusCode.PLANNED;
}
