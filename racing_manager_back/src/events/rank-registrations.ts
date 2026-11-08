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
    timeMilliseconds: number | null;
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
  if (registration.result.timeMilliseconds == null) return false;
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
      .filter((registration) =>
        isRankedCompleteResult(registration, eventLapCount),
      )
      .sort((a, b) => compareRegistrationsByResult(a, b, eventLapCount));
    const calculated = competitionPlaces(
      earners,
      (registration) => registration.result?.timeMilliseconds ?? 0,
    );
    const placeById = new Map(
      earners.map((registration, index) => [
        registration.id,
        calculated[index],
      ]),
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

export type RankableEnrollment = {
  enrollmentId: string;
  registrationId: string;
  startId: string;
  formatId: number;
  gender: string;
  startNumber: number | null;
  registeredAt: Date;
  outcome: string | null;
  timeMilliseconds: number | null;
  enrollmentStatus: string;
};

export type RankedEnrollment<T extends RankableEnrollment> = {
  enrollment: T;
  place: number | null;
};

export function isComparableFinish(enrollment: RankableEnrollment): boolean {
  return (
    enrollment.enrollmentStatus === 'REGISTERED' &&
    enrollment.outcome === 'FINISHED' &&
    enrollment.timeMilliseconds != null &&
    enrollment.timeMilliseconds > 0
  );
}

export function compareEnrollmentsByResult(
  a: RankableEnrollment,
  b: RankableEnrollment,
): number {
  const aRanked = isComparableFinish(a);
  const bRanked = isComparableFinish(b);
  if (aRanked && bRanked) {
    const aTime = a.timeMilliseconds ?? 0;
    const bTime = b.timeMilliseconds ?? 0;
    if (aTime !== bTime) return aTime - bTime;
    return (
      (a.startNumber ?? Number.POSITIVE_INFINITY) -
      (b.startNumber ?? Number.POSITIVE_INFINITY)
    );
  }
  if (aRanked) return -1;
  if (bRanked) return 1;
  return (
    (a.startNumber ?? Number.POSITIVE_INFINITY) -
      (b.startNumber ?? Number.POSITIVE_INFINITY) ||
    a.registeredAt.getTime() - b.registeredAt.getTime()
  );
}

/**
 * Computes place on read per start × format × gender category. Only
 * comparable FINISHED results earn a place; REGISTERED without a result and
 * DNS/DNF/DSQ stay listed with `place === null`.
 */
export function rankEnrollments<T extends RankableEnrollment>(
  enrollments: T[],
): RankedEnrollment<T>[] {
  const groups = new Map<string, T[]>();
  for (const enrollment of enrollments) {
    const key = `${enrollment.startId}:${enrollment.formatId}:${enrollment.gender}`;
    const group = groups.get(key);
    if (group) group.push(enrollment);
    else groups.set(key, [enrollment]);
  }

  const ranked: RankedEnrollment<T>[] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort(compareEnrollmentsByResult);
    const earners = sorted.filter(isComparableFinish);
    const calculated = competitionPlaces(
      earners,
      (enrollment) => enrollment.timeMilliseconds ?? 0,
    );
    const placeByEnrollment = new Map(
      earners.map((enrollment, index) => [
        enrollment.enrollmentId,
        calculated[index],
      ]),
    );
    for (const enrollment of sorted) {
      ranked.push({
        enrollment,
        place: placeByEnrollment.get(enrollment.enrollmentId) ?? null,
      });
    }
  }
  return ranked;
}
