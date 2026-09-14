import { toLocalIsoDate } from '../../shared/formatDateTime';
import type { RecentEventRow } from '../../shared/types/event';

export function calendarEvents(events: RecentEventRow[]): RecentEventRow[] {
  return events.filter((event) => event.status !== 'CANCELLED');
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
