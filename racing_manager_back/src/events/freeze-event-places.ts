import { Prisma } from '../../generated/prisma';
import {
  LISTED_REGISTRATION_STATUSES,
  isRankedRegistrationStatus,
} from '../registrations/registration-status';
import {
  categoriesFromStoredRows,
  convertLegacySections,
  resolveControlYear,
  type AgeCategory,
} from './age-groups';
import { rankEnrollments, type RankableEnrollment } from './rank-registrations';
import { rankRegistrations } from './rank-registrations';
import {
  currentPlacement,
  racePlacementForRow,
  type RaceScopeRow,
} from '../class-competitions/race-scope';

function categoryKey(
  startId: string,
  formatId: number,
  gender: string,
): string {
  return `${startId}:${formatId}:${gender}`;
}

function groupCategories(
  newRows: readonly {
    startId: string;
    formatId: number;
    gender: string;
    categoryNumber: number;
    groupId: string;
  }[],
  legacyRows: readonly {
    startId: string;
    formatId: number;
    gender: string;
    sectionId: string;
    sectionKind: string;
    sortOrder: number;
  }[],
): Map<string, AgeCategory[]> {
  const newGrouped = new Map<
    string,
    { categoryNumber: number; groupId: string }[]
  >();
  for (const row of newRows) {
    const key = categoryKey(row.startId, row.formatId, row.gender);
    const list = newGrouped.get(key) ?? [];
    list.push({ categoryNumber: row.categoryNumber, groupId: row.groupId });
    newGrouped.set(key, list);
  }
  const legacyGrouped = new Map<
    string,
    { sectionId: string; sectionKind: string; sortOrder: number }[]
  >();
  for (const row of legacyRows) {
    const key = categoryKey(row.startId, row.formatId, row.gender);
    const list = legacyGrouped.get(key) ?? [];
    list.push(row);
    legacyGrouped.set(key, list);
  }
  const categories = new Map<string, AgeCategory[]>();
  for (const key of new Set([...newGrouped.keys(), ...legacyGrouped.keys()])) {
    const stored = newGrouped.get(key);
    const resolved =
      stored && stored.length > 0
        ? categoriesFromStoredRows(stored)
        : convertLegacySections(legacyGrouped.get(key) ?? []);
    if (resolved.length > 0) categories.set(key, resolved);
  }
  return categories;
}

function groupRaces(
  rows: readonly RaceScopeRow[],
): Map<string, RaceScopeRow[]> {
  const grouped = new Map<string, RaceScopeRow[]>();
  for (const row of rows) {
    if (row.startId == null || row.formatId == null) continue;
    const key = categoryKey(row.startId, row.formatId, row.gender);
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  }
  return grouped;
}

export async function freezeEventPlaces(
  db: Prisma.TransactionClient,
  eventId: string,
): Promise<void> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      eventDate: true,
      starts: { select: { id: true } },
      laps: { select: { id: true } },
      ageSplitCategories: {
        select: {
          startId: true,
          formatId: true,
          gender: true,
          categoryNumber: true,
          groupId: true,
        },
      },
      ageSplitSections: {
        select: {
          startId: true,
          formatId: true,
          gender: true,
          sectionId: true,
          sectionKind: true,
          sortOrder: true,
        },
      },
      classCompetitions: {
        select: {
          id: true,
          startId: true,
          formatId: true,
          gender: true,
          sectionId: true,
          sectionKind: true,
          targetKey: true,
          targetGroupIds: true,
          targetWholeCategory: true,
          frozenTitle: true,
          frozenSubtitle: true,
          frozenYoungestBound: true,
          frozenMemberBounds: true,
          frozenSectionNumber: true,
          capturedEnrollmentIds: true,
          capturedRegistrationIds: true,
        },
      },
      registrations: {
        where: { status: { in: [...LISTED_REGISTRATION_STATUSES] } },
        select: {
          id: true,
          formatId: true,
          gender: true,
          birthYear: true,
          startNumber: true,
          status: true,
          registeredAt: true,
          result: {
            select: {
              id: true,
              timeMilliseconds: true,
              place: true,
              laps: { select: { id: true } },
            },
          },
          enrollments: {
            where: { status: 'REGISTERED' },
            select: {
              id: true,
              startId: true,
              formatId: true,
              status: true,
              result: {
                select: { id: true, outcome: true, timeMilliseconds: true },
              },
            },
          },
        },
      },
    },
  });
  if (!event) return;

  if (event.starts.length === 0) {
    const bracketKeys = new Set(
      event.classCompetitions
        .filter((row) => row.startId == null && row.formatId != null)
        .map((row) => `${row.formatId}:${row.gender}`),
    );
    const ranked = rankRegistrations(
      event.registrations.map((registration) => ({
        id: registration.id,
        formatId: registration.formatId,
        gender: registration.gender,
        startNumber: registration.startNumber,
        status: registration.status,
        registeredAt: registration.registeredAt,
        result: registration.result,
      })),
      event.laps.length,
    );
    for (const { registration, place } of ranked) {
      if (place == null) continue;
      if (
        bracketKeys.has(
          `${registration.formatId ?? 'none'}:${registration.gender}`,
        )
      ) {
        continue;
      }
      const resultId = event.registrations.find(
        (row) => row.id === registration.id,
      )?.result?.id;
      if (!resultId) continue;
      await db.result.update({
        where: { id: resultId },
        data: { place },
      });
    }
    return;
  }

  const controlYear = resolveControlYear(event.eventDate);
  const categories = groupCategories(
    event.ageSplitCategories,
    event.ageSplitSections,
  );
  const races = groupRaces(event.classCompetitions);

  const buckets = new Map<string, RankableEnrollment[]>();
  for (const registration of event.registrations) {
    if (!isRankedRegistrationStatus(registration.status)) continue;
    for (const enrollment of registration.enrollments) {
      const key = categoryKey(
        enrollment.startId,
        enrollment.formatId,
        registration.gender,
      );
      const placement = currentPlacement(
        registration.birthYear,
        controlYear,
        categories.get(key) ?? [],
      );
      const race = racePlacementForRow(races.get(key) ?? [], {
        enrollmentId: enrollment.id,
        registrationId: registration.id,
        placement,
      });
      if (race) continue;
      const bucketKey = `${key}:${placement.sectionId}`;
      const bucket = buckets.get(bucketKey) ?? [];
      bucket.push({
        enrollmentId: enrollment.id,
        registrationId: registration.id,
        startId: enrollment.startId,
        formatId: enrollment.formatId,
        gender: registration.gender,
        startNumber: registration.startNumber,
        registeredAt: registration.registeredAt,
        outcome: enrollment.result?.outcome ?? null,
        timeMilliseconds: enrollment.result?.timeMilliseconds ?? null,
        enrollmentStatus: enrollment.status,
      });
      buckets.set(bucketKey, bucket);
    }
  }

  for (const bucket of buckets.values()) {
    const resultIdByEnrollment = new Map(
      event.registrations.flatMap((registration) =>
        registration.enrollments.map(
          (enrollment) => [enrollment.id, enrollment.result?.id] as const,
        ),
      ),
    );
    for (const { enrollment, place } of rankEnrollments(bucket)) {
      if (place == null) continue;
      const resultId = resultIdByEnrollment.get(enrollment.enrollmentId);
      if (!resultId) continue;
      await db.result.update({
        where: { id: resultId },
        data: { place },
      });
    }
  }
}
