import { formatDateTime } from '../../shared/formatDateTime';
import type { RecentEventRow, StartResponse } from '../../shared/types/event';
import type { MainEventRow, MainEventStatus } from '../../shared/types/main';

function eventStatus(status: string): MainEventStatus {
  return status === 'IN_PROGRESS' || status === 'DONE' ? status : 'PLANNED';
}

function startDistanceKm(start: StartResponse): number {
  const meters = start.legacyEffectiveDistanceM ?? start.displayedDistanceMeters;
  return Number((meters / 1000).toFixed(2));
}

/**
 * Builds parent event rows with one child row per start. Starts are ordered by
 * `sortOrder`; the parent distance stays empty and child rows carry the start
 * distance and `REGISTERED` enrollment count.
 */
export function buildUpcomingRows(events: RecentEventRow[]): MainEventRow[] {
  return events.map((event) => {
    const starts = [...(event.starts ?? [])].sort(
      (left, right) =>
        left.sortOrder - right.sortOrder || left.id.localeCompare(right.id),
    );
    const registeredCount =
      starts.length > 0
        ? starts.reduce((sum, start) => sum + start.registeredCount, 0)
        : event.registeredCount;
    const children: MainEventRow[] = starts.map((start) => ({
      key: `${event.id}:${start.id}`,
      event: start.resolvedLabel,
      date: '',
      distanceKm: startDistanceKm(start),
      status: 'PLANNED',
      track: '',
      registeredCount: start.registeredCount,
      starts: [],
      isStart: true,
    }));
    return {
      key: event.id,
      event: event.name,
      date: formatDateTime(event.eventDate),
      distanceKm: null,
      status: eventStatus(event.status),
      track: event.trackName,
      registeredCount,
      starts,
      ...(children.length > 0 ? { children } : {}),
    };
  });
}
