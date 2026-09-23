import { isRankedRegistrationStatus } from '../registrations/registration-status';
import { competitionPlaces } from '../ranking/competition-places';

export type PersonalStats = {
  starts: number;
  wins: number;
  podiums: number;
  upcomingStarts: number;
};

export const EMPTY_PERSONAL_STATS: PersonalStats = {
  starts: 0,
  wins: 0,
  podiums: 0,
  upcomingStarts: 0,
};

export type StatsRegistration = {
  id: string;
  eventId: string;
  formatId: number | null;
  gender: string;
  startNumber: number | null;
  status: string;
  event: {
    status: string;
    eventDate: Date;
    lapCount: number;
  };
  result: {
    timeMilliseconds: number;
    lapCount: number;
    place: number | null;
  } | null;
};

export function isCompleteStatsResult(row: StatsRegistration): boolean {
  if (!isRankedRegistrationStatus(row.status)) return false;
  if (!row.result) return false;
  if (row.event.lapCount === 0) return true;
  return row.result.lapCount === row.event.lapCount;
}

export function computePersonalStats(
  own: StatsRegistration[],
  competitors: StatsRegistration[],
  now = new Date(),
): PersonalStats {
  const today = toLocalIsoDate(now);
  const activeOwn = own.filter((row) => row.event.status !== 'CANCELLED');
  const starts = activeOwn.filter((row) => isPastEvent(row.event, today)).length;
  const upcomingStarts = activeOwn.filter((row) => !isPastEvent(row.event, today)).length;

  const completeOwn = activeOwn.filter(isCompleteStatsResult);
  const byClass = new Map<string, StatsRegistration[]>();
  for (const row of competitors) {
    if (!isCompleteStatsResult(row)) continue;
    const key = classKey(row);
    const group = byClass.get(key);
    if (group) group.push(row);
    else byClass.set(key, [row]);
  }

  let wins = 0;
  let podiums = 0;
  for (const row of completeOwn) {
    const group = byClass.get(classKey(row)) ?? [row];
    const sorted = [...group].sort(compareCompleteResults);
    const places = competitionPlaces(
      sorted,
      (item) => item.result?.timeMilliseconds ?? 0,
    );
    const index = sorted.findIndex((item) => item.id === row.id);
    const place = index >= 0 ? places[index] : 0;
    if (place <= 0) continue;
    if (place === 1) wins += 1;
    if (place <= 3) podiums += 1;
  }

  return { starts, wins, podiums, upcomingStarts };
}

function isPastEvent(
  event: { status: string; eventDate: Date },
  today: string,
): boolean {
  return event.status === 'DONE' || toLocalIsoDate(event.eventDate) < today;
}

function classKey(row: Pick<StatsRegistration, 'eventId' | 'formatId' | 'gender'>): string {
  return `${row.eventId}:${row.formatId ?? 'none'}:${row.gender}`;
}

function compareCompleteResults(left: StatsRegistration, right: StatsRegistration): number {
  const leftTime = left.result?.timeMilliseconds ?? 0;
  const rightTime = right.result?.timeMilliseconds ?? 0;
  if (leftTime !== rightTime) return leftTime - rightTime;
  return (
    (left.startNumber ?? Number.POSITIVE_INFINITY) -
    (right.startNumber ?? Number.POSITIVE_INFINITY)
  );
}

function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
