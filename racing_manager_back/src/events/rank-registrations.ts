import { competitionPlaces } from '../ranking/competition-places';
import { isRankedRegistrationStatus } from '../registrations/registration-status';

export type RankableRegistration = {
  id: string;
  formatId: number | null;
  gender: string;
  startNumber: number | null;
  status: string;
  registeredAt: Date;
  result: {
    timeMilliseconds: number;
    place?: number | null;
    laps: { length: number };
  } | null;
};

export type RankedRegistration<T extends RankableRegistration> = {
  registration: T;
  place: number | null;
};

export function isCompleteResult(
  registration: RankableRegistration,
  eventLapCount: number,
): boolean {
  if (!registration.result) return false;
  if (eventLapCount === 0) return true;
  return registration.result.laps.length === eventLapCount;
}

export function isRankedCompleteResult(
  registration: RankableRegistration,
  eventLapCount: number,
): boolean {
  return (
    isRankedRegistrationStatus(registration.status) &&
    isCompleteResult(registration, eventLapCount)
  );
}

export function compareRegistrationsByResult(
  a: RankableRegistration,
  b: RankableRegistration,
  eventLapCount: number,
): number {
  const aRanked = isRankedCompleteResult(a, eventLapCount);
  const bRanked = isRankedCompleteResult(b, eventLapCount);
  if (aRanked && bRanked) {
    const aTime = a.result?.timeMilliseconds ?? 0;
    const bTime = b.result?.timeMilliseconds ?? 0;
    if (aTime !== bTime) return aTime - bTime;
    return (
      (a.startNumber ?? Number.POSITIVE_INFINITY) -
      (b.startNumber ?? Number.POSITIVE_INFINITY)
    );
  }
  if (aRanked) return -1;
  if (bRanked) return 1;
  if (a.result && !b.result) return -1;
  if (!a.result && b.result) return 1;

  const aNumber = a.startNumber;
  const bNumber = b.startNumber;
  if (aNumber !== null && bNumber !== null) return aNumber - bNumber;
  if (aNumber !== null) return -1;
  if (bNumber !== null) return 1;
  return a.registeredAt.getTime() - b.registeredAt.getTime();
}

export function hasStoredPlaces(
  eventStatus: string,
  registrations: RankableRegistration[],
): boolean {
  return (
    eventStatus === 'DONE' &&
    registrations.some((row) => row.result?.place != null)
  );
}

export function rankRegistrations<T extends RankableRegistration>(
  registrations: T[],
  eventLapCount: number,
  useStoredPlaces = false,
): RankedRegistration<T>[] {
  const groups = new Map<string, T[]>();
  for (const registration of registrations) {
    const key = `${registration.formatId ?? 'none'}:${registration.gender}`;
    const group = groups.get(key);
    if (group) group.push(registration);
    else groups.set(key, [registration]);
  }

  const ranked: RankedRegistration<T>[] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => {
      if (useStoredPlaces) {
        const aPlace = a.result?.place ?? null;
        const bPlace = b.result?.place ?? null;
        if (aPlace != null && bPlace != null && aPlace !== bPlace) {
          return aPlace - bPlace;
        }
        if (aPlace != null && bPlace == null) return -1;
        if (aPlace == null && bPlace != null) return 1;
      }
      return compareRegistrationsByResult(a, b, eventLapCount);
    });
    const earners = sorted
      .filter((registration) => isRankedCompleteResult(registration, eventLapCount))
      .sort((a, b) => compareRegistrationsByResult(a, b, eventLapCount));
    const calculated = competitionPlaces(
      earners,
      (registration) => registration.result?.timeMilliseconds ?? 0,
    );
    const placeById = new Map(
      earners.map((registration, index) => [registration.id, calculated[index]]),
    );
    for (const registration of sorted) {
      ranked.push({
        registration,
        place: placeById.get(registration.id) ?? null,
      });
    }
  }
  return ranked;
}
