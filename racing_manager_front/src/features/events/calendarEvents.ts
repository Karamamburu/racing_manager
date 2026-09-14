import { toLocalIsoDate } from '../../shared/formatDateTime';
import type { RecentEventRow } from '../../shared/types/event';

export type CalendarViewPeriod = {
  mode: 'month' | 'year';
  year: number;
  month: number;
};

export function calendarPeriodRange(period: CalendarViewPeriod): { from: string; to: string } {
  if (period.mode === 'year') {
    return {
      from: new Date(period.year, 0, 1).toISOString(),
      to: new Date(period.year + 1, 0, 1).toISOString(),
    };
  }

  return {
    from: new Date(period.year, period.month, 1).toISOString(),
    to: new Date(period.year, period.month + 1, 1).toISOString(),
  };
}

export function calendarEvents(events: RecentEventRow[]): RecentEventRow[] {
  return events.filter((event) => event.status !== 'CANCELLED');
}

export function eventsInCalendarPeriod(
  events: RecentEventRow[],
  period: CalendarViewPeriod,
): RecentEventRow[] {
  const prefix =
    period.mode === 'year'
      ? String(period.year)
      : `${period.year}-${String(period.month + 1).padStart(2, '0')}`;

  return calendarEvents(events).filter((event) =>
    toLocalIsoDate(event.eventDate).startsWith(prefix),
  );
}

export function groupEventsByDate(events: RecentEventRow[]): Map<string, RecentEventRow[]> {
  const grouped = new Map<string, RecentEventRow[]>();

  for (const event of events) {
    const key = toLocalIsoDate(event.eventDate);
    const bucket = grouped.get(key);
    if (bucket) bucket.push(event);
    else grouped.set(key, [event]);
  }

  for (const bucket of grouped.values()) {
    bucket.sort((left, right) => left.eventDate.localeCompare(right.eventDate));
  }

  return grouped;
}

export function groupEventsByMonth(events: RecentEventRow[]): Map<string, RecentEventRow[]> {
  const grouped = new Map<string, RecentEventRow[]>();

  for (const event of events) {
    const key = toLocalIsoDate(event.eventDate).slice(0, 7);
    const bucket = grouped.get(key);
    if (bucket) bucket.push(event);
    else grouped.set(key, [event]);
  }

  for (const bucket of grouped.values()) {
    bucket.sort((left, right) => left.eventDate.localeCompare(right.eventDate));
  }

  return grouped;
}

export function formatEventsCount(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} мероприятие`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} мероприятия`;
  }
  return `${count} мероприятий`;
}
