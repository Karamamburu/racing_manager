import type { RecentEventRow } from '../../shared/types/event';

export function todayIsoDate(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isPastEvent(event: RecentEventRow, today = todayIsoDate()): boolean {
  return event.status === 'DONE' || event.eventDate < today;
}

export function visibleCatalogEvents(
  events: RecentEventRow[],
  showPast: boolean,
  today = todayIsoDate(),
): RecentEventRow[] {
  const upcoming = events
    .filter((event) => !isPastEvent(event, today))
    .sort((left, right) => left.eventDate.localeCompare(right.eventDate));

  if (!showPast) return upcoming;

  const past = events
    .filter((event) => isPastEvent(event, today))
    .sort((left, right) => right.eventDate.localeCompare(left.eventDate));

  return [...upcoming, ...past];
}
