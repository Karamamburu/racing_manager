export const MOSCOW_TIME_ZONE = 'Europe/Moscow';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const NAIVE_DATE_TIME =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;
const HAS_TIME_ZONE = /(?:[zZ]|[+-]\d{2}(?::?\d{2})?)$/;

export function toMoscowDateOnly(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00+03:00`);
}

export function parseMoscowDateTime(value: string): Date {
  const trimmed = value.trim();
  if (DATE_ONLY.test(trimmed)) {
    return toMoscowDateOnly(trimmed);
  }
  if (NAIVE_DATE_TIME.test(trimmed) && !HAS_TIME_ZONE.test(trimmed)) {
    return new Date(`${trimmed.replace(' ', 'T')}+03:00`);
  }
  return new Date(trimmed);
}
