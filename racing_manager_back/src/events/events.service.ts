import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ADMIN_ROLE_CODES, RoleCode } from '../auth/role-codes';
import { RolesService } from '../auth/roles.service';
import { ALESHKINO_TRACK_ID } from '../tracks/aleshkino';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  LISTED_REGISTRATION_STATUSES,
  RegistrationStatusCode,
  isRankedRegistrationStatus,
} from '../registrations/registration-status';
import {
  parseCreateEventBody,
  isSport,
  type ParsedCreateEvent,
  type ParsedStartInput,
  type StartPurposeTypeCode,
  type StartRouteColorCode,
} from './parse-create-event';
import { parseUpdateEventBody } from './parse-update-event';
import {
  areStartsIdentical,
  findStartLabelCollisions,
} from './starts-identity';
import { resolveStartLabel, type StartNamingConfig } from './starts-label';
import { displayedDistanceMeters } from './starts-distance';
import {
  EventStatusCode,
  PAST_COMPLETED_EVENT_LOCKED_MESSAGE,
  isPastCompletedEvent,
} from './event-status';
import { EventStatusSyncService } from './event-status-sync.service';
import { freezeEventPlaces } from './freeze-event-places';
import { parseFinishCategoryBody } from './parse-finish-category';
import { categoryIsFinished } from './category-finish';
import { parseEventDateRange } from './parse-event-date-range';
import { parseUpdateEventStatusBody } from './parse-update-event-status';
import { logEvent } from '../logging/log-event';
import { rankEnrollments, type RankableEnrollment } from './rank-registrations';
import {
  ageGroupFor,
  categoriesFromStoredRows,
  categoryForBirthYear,
  categorySectionId,
  categorySubtitle,
  categoryTitle,
  convertLegacySections,
  isStoredSectionId,
  normalizeAgeCategories,
  resolveControlYear,
  type AgeCategory,
  type AgeCategorySectionId,
  type AgeGroupId,
  type AgeSectionId,
  type StoredAgeSection,
} from './age-groups';
import type { AgeCategoriesRef } from './age-split.service';
import {
  currentPlacement,
  racePlacementForRow,
  type RaceScopeRow,
} from '../class-competitions/race-scope';

export type ParticipationFormatDto = {
  id: number;
  sport: string;
  code: string;
  name: string;
  sortOrder: number;
};

export type EventFormatRef = {
  id: number;
  code: string;
  name: string;
  sortOrder: number;
};

export type EventLapRef = {
  id: string;
  lapNumber: number;
  distanceKm: number;
};

export type EventStartRef = {
  id: string;
  purposeType: string;
  formatIds: number[];
  formats: EventFormatRef[];
  lapCount: number;
  lapLengthMeters: number;
  displayName: string | null;
  routeColor: StartRouteColorCode | null;
  resolvedLabel: string;
  sortOrder: number;
  legacyEffectiveDistanceM: number | null;
  displayedDistanceMeters: number;
};

export type EventResponse = {
  id: string;
  trackId: string;
  name: string;
  eventType: string;
  sport: string;
  eventDate: string;
  distanceKm: number | null;
  description: string | null;
  mapLink: string | null;
  registrationOpen: string | null;
  registrationClose: string | null;
  status: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  formats: EventFormatRef[];
  laps: EventLapRef[];
  starts: EventStartRef[];
};

export type CatalogStartRef = EventStartRef & {
  registeredCount: number;
};

export type RecentEventRow = {
  id: string;
  name: string;
  eventDate: string;
  distanceKm: number | null;
  status: string;
  trackName: string;
  registeredCount: number;
  starts: CatalogStartRef[];
};

export type EventDetails = {
  id: string;
  name: string;
  eventType: string;
  sport: string;
  eventDate: string;
  distanceKm: number | null;
  description: string | null;
  mapLink: string | null;
  registrationOpen: string | null;
  registrationClose: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  track: {
    id: string;
    name: string;
    locationCity: string | null;
    mapLink: string | null;
  };
  createdBy: {
    id: string;
    name: string;
  } | null;
  formats: EventFormatRef[];
  laps: EventLapRef[];
  starts: EventStartRef[];
  registrations: EventParticipant[] | null;
  registeredCount: number;
  finishedCategories: CategoryFinishRef[];
  ageSplits?: AgeCategoriesRef[];
};

export type CategoryFinishRef = {
  startId: string | null;
  formatId: number | null;
  gender: string;
};

export type EventParticipant = {
  id: string;
  enrollmentId: string;
  startId: string;
  startLabel: string;
  sortOrder: number;
  enrollmentStatus: string;
  userId: string | null;
  fullName: string;
  birthYear: number | null;
  gender: string | null;
  city: string | null;
  district: string | null;
  team: string | null;
  startNumber: number | null;
  finishTimeMs: number | null;
  outcome: string | null;
  place: number | null;
  format: EventFormatRef | null;
  laps: { lapNumber: number; timeMilliseconds: number }[];
  status: string;
  isCupEligible: boolean;
  note: string | null;
  registeredAt: string;
  sectionId: string;
  ageGroupId: AgeGroupId | null;
  raceId?: string | null;
  raceRole?: 'CAPTURED' | 'OUTSIDE_RACE' | null;
};

type DecimalValue = { toString(): string } | null;

type StoredEvent = {
  id: string;
  trackId: string;
  name: string;
  eventType: string;
  sport: string;
  eventDate: Date;
  distanceKm: DecimalValue;
  description: string | null;
  mapLink: string | null;
  registrationOpen: Date | null;
  registrationClose: Date | null;
  status: string;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type CatalogEvent = {
  id: string;
  name: string;
  eventDate: Date;
  distanceKm: DecimalValue;
  status: string;
  track: { name: string };
  starts?: StoredStart[];
  _count: { registrations: number };
};

type PersonRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  userName: string;
};

type StoredFormat = {
  id: number;
  code: string;
  name: string;
  sortOrder: number;
};

type StoredLap = {
  id: string;
  lapNumber: number;
  distanceKm: DecimalValue;
};

type StoredStart = {
  id: string;
  purposeType: string;
  lapCount: number;
  lapLengthMeters: number;
  displayName: string | null;
  routeColor: string | null;
  sortOrder: number;
  legacyEffectiveDistanceM: number | null;
  formats: { format: StoredFormat }[];
  enrollments?: { formatId: number }[];
  _count?: { enrollments: number };
};

type StoredResultLap = {
  timeMilliseconds: number;
  eventLap: { lapNumber: number };
};

type StoredEnrollmentResult = {
  outcome: string | null;
  timeMilliseconds: number | null;
  place: number | null;
};

type StoredEnrollment = {
  id: string;
  startId: string;
  formatId: number;
  status: string;
  start: StoredStart;
  result: StoredEnrollmentResult | null;
};

type StoredRegistration = {
  id: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  gender: string;
  birthYear: number;
  city: string | null;
  district: string | null;
  team: string | null;
  formatId: number | null;
  format: StoredFormat | null;
  startNumber: number | null;
  status: string;
  note: string | null;
  registeredAt: Date;
  result: {
    timeMilliseconds: number | null;
    place: number | null;
    laps: StoredResultLap[];
  } | null;
  enrollments?: StoredEnrollment[];
};

type EventWithDetails = StoredEvent & {
  track: EventDetails['track'];
  createdBy: PersonRow | null;
  eventFormats: { format: StoredFormat }[];
  laps: StoredLap[];
  starts?: StoredStart[];
  registrations?: StoredRegistration[];
  _count: { registrations: number };
};

type EventOwnerRow = {
  id: string;
  createdById: string | null;
  status: string;
};

type StoredAgeSplitRow = {
  startId: string;
  formatId: number;
  gender: string;
  sectionId: string;
  sectionKind: 'BASE_GROUP' | 'PRESET';
  sortOrder: number;
};

type StoredAgeCategoryRow = {
  startId: string;
  formatId: number;
  gender: string;
  categoryNumber: number;
  groupId: string;
};

type StoredClassCompetitionRow = {
  id: string;
  startId: string | null;
  formatId: number | null;
  gender: string;
  status: string;
  sectionId: string | null;
  sectionKind: string | null;
  targetKey: string;
  targetGroupIds: string[];
  targetWholeCategory: boolean;
  frozenTitle: string | null;
  frozenSubtitle: string | null;
  frozenYoungestBound: number | null;
  frozenMemberBounds: number[];
  frozenSectionNumber: number | null;
  capturedEnrollmentIds: string[];
  capturedRegistrationIds: string[];
};

type EventsStore = {
  track: {
    findUnique: (args: {
      where: { id: string };
    }) => Promise<{ id: string } | null>;
  };
  event: {
    create: (args: { data: object; include?: object }) => Promise<
      StoredEvent & {
        eventFormats?: { format: StoredFormat }[];
        laps?: StoredLap[];
        starts?: StoredStart[];
      }
    >;
    findMany: (args: object) => Promise<CatalogEvent[]>;
    findUnique: {
      (args: {
        where: { id: string };
        include: object;
      }): Promise<EventWithDetails | null>;
      (args: {
        where: { id: string };
        select: { id: true; createdById: true; status: true };
      }): Promise<EventOwnerRow | null>;
    };
    update: (args: { where: { id: string }; data: object }) => Promise<unknown>;
    delete: (args: { where: { id: string } }) => Promise<unknown>;
  };
  registration: {
    updateMany: (args: { where: object; data: object }) => Promise<unknown>;
  };
  result: {
    deleteMany: (args: { where: object }) => Promise<unknown>;
  };
  // Optional in the store shape so unit doubles that predate the age split keep
  // working; the real `PrismaService` always exposes both delegates.
  ageSplitSection?: {
    findMany: (args: object) => Promise<StoredAgeSplitRow[]>;
  };
  ageSplitCategory?: {
    findMany: (args: object) => Promise<StoredAgeCategoryRow[]>;
  };
  classCompetition?: {
    findMany: (args: object) => Promise<StoredClassCompetitionRow[]>;
  };
};

function toKm(value: DecimalValue): number | null {
  return value === null ? null : Number(value.toString());
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function toFormatRef(format: StoredFormat): EventFormatRef {
  return {
    id: format.id,
    code: format.code,
    name: format.name,
    sortOrder: format.sortOrder,
  };
}

function mapEventFormats(
  eventFormats: { format: StoredFormat }[] | undefined,
): EventFormatRef[] {
  return [...(eventFormats ?? [])]
    .map((row) => toFormatRef(row.format))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
}

function toLapRef(lap: StoredLap): EventLapRef {
  return {
    id: lap.id,
    lapNumber: lap.lapNumber,
    distanceKm: toKm(lap.distanceKm) ?? 0,
  };
}

function mapEventLaps(laps: StoredLap[] | undefined): EventLapRef[] {
  return [...(laps ?? [])]
    .map(toLapRef)
    .sort((a, b) => a.lapNumber - b.lapNumber);
}

type StartConfig = {
  id?: string;
  purposeType: StartPurposeTypeCode;
  formatIds: number[];
  lapCount: number;
  lapLengthMeters: number;
  displayName: string | null;
  routeColor: StartRouteColorCode | null;
  sortOrder: number;
  legacyEffectiveDistanceM: number | null;
};

function toStartNamingConfig(
  start: Pick<
    StartConfig,
    | 'purposeType'
    | 'lapCount'
    | 'lapLengthMeters'
    | 'displayName'
    | 'legacyEffectiveDistanceM'
  >,
): StartNamingConfig {
  return {
    purposeType: start.purposeType,
    lapCount: start.lapCount,
    lapLengthMeters: start.lapLengthMeters,
    displayName: start.displayName,
    legacyEffectiveDistanceM: start.legacyEffectiveDistanceM,
  };
}

function primaryStart(starts: StartConfig[]): StartConfig {
  return [...starts].sort(
    (left, right) =>
      left.sortOrder - right.sortOrder ||
      (left.id ?? '').localeCompare(right.id ?? ''),
  )[0];
}

function projectedEventLaps(
  start: StartConfig,
): { lapNumber: number; distanceKm: number }[] {
  const distanceKm = Number((start.lapLengthMeters / 1000).toFixed(2));
  return Array.from({ length: start.lapCount }, (_, index) => ({
    lapNumber: index + 1,
    distanceKm,
  }));
}

function projectedEventDistanceKm(start: StartConfig): number {
  return Number(
    (displayedDistanceMeters(toStartNamingConfig(start)) / 1000).toFixed(2),
  );
}

function toStartRef(start: StoredStart): EventStartRef {
  const formats = [...start.formats]
    .map((row) => toFormatRef(row.format))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const naming = toStartNamingConfig({
    purposeType: start.purposeType as StartPurposeTypeCode,
    lapCount: start.lapCount,
    lapLengthMeters: start.lapLengthMeters,
    displayName: start.displayName,
    legacyEffectiveDistanceM: start.legacyEffectiveDistanceM,
  });

  return {
    id: start.id,
    purposeType: start.purposeType,
    formatIds: formats.map((format) => format.id),
    formats,
    lapCount: start.lapCount,
    lapLengthMeters: start.lapLengthMeters,
    displayName: start.displayName,
    routeColor: start.routeColor as StartRouteColorCode | null,
    resolvedLabel: resolveStartLabel(naming),
    sortOrder: start.sortOrder,
    legacyEffectiveDistanceM: start.legacyEffectiveDistanceM,
    displayedDistanceMeters: displayedDistanceMeters(naming),
  };
}

function mapEventStarts(starts: StoredStart[] | undefined): EventStartRef[] {
  return [...(starts ?? [])]
    .map(toStartRef)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

function mapCatalogStarts(
  starts: StoredStart[] | undefined,
): CatalogStartRef[] {
  return [...(starts ?? [])]
    .map((start) => ({
      ...toStartRef(start),
      registeredCount: start._count?.enrollments ?? 0,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

const CATEGORY_SECTION_ID = 'CATEGORY';
const CATEGORY_SECTION_RANK = 0;
const REMAINDER_SECTION_RANK = 100;
const NO_BIRTH_YEAR_SECTION_RANK = 101;

type ProtocolSectionContext = {
  categoriesByCategory: Map<string, AgeCategory[]>;
  racesByCategory: Map<string, RaceScopeRow[]>;
  controlYear: number;
};

type ProtocolBaseRow = RankableEnrollment & {
  registration: StoredRegistration;
  start: StoredStart;
  format: StoredFormat | null;
  sectionId: string;
  sectionRank: number;
  ageGroupId: AgeGroupId | null;
  raceId: string | null;
  raceRole: 'CAPTURED' | 'OUTSIDE_RACE' | null;
};

type ProtocolRow = ProtocolBaseRow & { place: number | null };

type ProtocolView = {
  registrations: EventParticipant[];
  ageSplits: AgeCategoriesRef[];
};

function categoryKey(
  startId: string,
  formatId: number,
  gender: string,
): string {
  return `${startId}:${formatId}:${gender}`;
}

function isStoredAgeSectionId(value: string): value is AgeSectionId {
  return isStoredSectionId(value);
}

function toStoredAgeSection(row: StoredAgeSplitRow): StoredAgeSection | null {
  if (!isStoredAgeSectionId(row.sectionId)) {
    return null;
  }
  return {
    sectionId: row.sectionId,
    sectionKind: row.sectionKind,
    sortOrder: row.sortOrder,
  };
}

function groupStoredSections(
  rows: readonly StoredAgeSplitRow[],
): Map<string, StoredAgeSection[]> {
  const grouped = new Map<string, StoredAgeSection[]>();
  for (const row of rows) {
    const section = toStoredAgeSection(row);
    if (!section) continue;
    const key = categoryKey(row.startId, row.formatId, row.gender);
    const sections = grouped.get(key);
    if (sections) sections.push(section);
    else grouped.set(key, [section]);
  }
  for (const sections of grouped.values()) {
    sections.sort((left, right) => left.sortOrder - right.sortOrder);
  }
  return grouped;
}

function groupStoredCategories(
  rows: readonly StoredAgeCategoryRow[],
): Map<string, StoredAgeCategoryRow[]> {
  const grouped = new Map<string, StoredAgeCategoryRow[]>();
  for (const row of rows) {
    const key = categoryKey(row.startId, row.formatId, row.gender);
    const categoryRows = grouped.get(key);
    if (categoryRows) categoryRows.push(row);
    else grouped.set(key, [row]);
  }
  return grouped;
}

/**
 * A protocol category reads its saved category rows when it has any, and falls
 * back to the legacy section rows only for categories without them. A category
 * whose input converts to nothing is read as unsplit.
 */
function categoriesByCategory(
  newRows: readonly StoredAgeCategoryRow[],
  legacyRows: readonly StoredAgeSplitRow[],
): Map<string, AgeCategory[]> {
  const newByCategory = groupStoredCategories(newRows);
  const legacyByCategory = groupStoredSections(legacyRows);
  const categories = new Map<string, AgeCategory[]>();
  for (const key of new Set([
    ...newByCategory.keys(),
    ...legacyByCategory.keys(),
  ])) {
    const storedRows = newByCategory.get(key);
    const resolved =
      storedRows && storedRows.length > 0
        ? normalizeAgeCategories(categoriesFromStoredRows(storedRows))
        : convertLegacySections(legacyByCategory.get(key) ?? []);
    if (resolved.length > 0) {
      categories.set(key, resolved);
    }
  }
  return categories;
}

function groupClassCompetitions(
  rows: readonly StoredClassCompetitionRow[],
): Map<string, RaceScopeRow[]> {
  const grouped = new Map<string, RaceScopeRow[]>();
  for (const row of rows) {
    if (row.startId == null || row.formatId == null) continue;
    const key = categoryKey(row.startId, row.formatId, row.gender);
    const list = grouped.get(key) ?? [];
    list.push({
      id: row.id,
      startId: row.startId,
      formatId: row.formatId,
      gender: row.gender,
      sectionId: row.sectionId,
      sectionKind: row.sectionKind,
      targetKey: row.targetKey,
      targetGroupIds: row.targetGroupIds,
      targetWholeCategory: row.targetWholeCategory,
      frozenTitle: row.frozenTitle,
      frozenSubtitle: row.frozenSubtitle,
      frozenYoungestBound: row.frozenYoungestBound,
      frozenMemberBounds: row.frozenMemberBounds,
      frozenSectionNumber: row.frozenSectionNumber,
      capturedEnrollmentIds: row.capturedEnrollmentIds,
      capturedRegistrationIds: row.capturedRegistrationIds,
    });
    grouped.set(key, list);
  }
  return grouped;
}

function sectionRankFor(sectionId: AgeCategorySectionId): number {
  if (sectionId === 'REMAINDER') return REMAINDER_SECTION_RANK;
  if (sectionId === 'NO_BIRTH_YEAR') return NO_BIRTH_YEAR_SECTION_RANK;
  return Number(sectionId.slice('CATEGORY_'.length));
}

function toProtocolGender(gender: string): 'M' | 'F' {
  return gender === 'F' ? 'F' : 'M';
}

function compareProtocolRows(left: ProtocolRow, right: ProtocolRow): number {
  return (
    left.gender.localeCompare(right.gender) ||
    left.start.sortOrder - right.start.sortOrder ||
    (left.format?.sortOrder ?? 0) - (right.format?.sortOrder ?? 0) ||
    left.sectionRank - right.sectionRank ||
    (left.place ?? Number.POSITIVE_INFINITY) -
      (right.place ?? Number.POSITIVE_INFINITY) ||
    (left.startNumber ?? Number.POSITIVE_INFINITY) -
      (right.startNumber ?? Number.POSITIVE_INFINITY)
  );
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);
  private readonly store: EventsStore;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rolesService: RolesService,
    private readonly usersService: UsersService,
    private readonly eventStatusSync: EventStatusSyncService,
  ) {
    this.store = prisma as unknown as EventsStore;
  }

  async create(
    authentikId: string | undefined,
    body: unknown,
  ): Promise<EventResponse> {
    await this.rolesService.assertAdminAccess(authentikId);

    const actor = await this.usersService.findBySub(authentikId as string);
    if (!actor) {
      throw new UnauthorizedException(
        'Not authenticated. Start with GET /auth/login.',
      );
    }

    const parsed: ParsedCreateEvent = parseCreateEventBody(body);
    if (!parsed.starts) {
      throw new BadRequestException('starts is required.');
    }
    if (parsed.starts.some((start) => start.id !== undefined)) {
      throw new BadRequestException('starts[].id must be omitted on create.');
    }

    const startConfigs: StartConfig[] = parsed.starts.map((start) => ({
      ...start,
      legacyEffectiveDistanceM: null,
    }));
    await this.resolveStartFormats(parsed.sport, startConfigs);
    this.assertStartSetValid(startConfigs);

    const primary = primaryStart(startConfigs);
    const laps = projectedEventLaps(primary);

    const track = await this.store.track.findUnique({
      where: { id: ALESHKINO_TRACK_ID },
    });
    if (!track) {
      throw new NotFoundException(
        'Track Алёшкино is not seeded. Apply db/migrate_roles.sql.',
      );
    }

    const created = await this.store.event.create({
      data: {
        trackId: ALESHKINO_TRACK_ID,
        name: parsed.name,
        eventType: asString(parsed.eventType),
        sport: asString(parsed.sport),
        eventDate: parsed.eventDate,
        distanceKm: projectedEventDistanceKm(primary),
        description: parsed.description,
        mapLink: parsed.mapLink,
        registrationOpen: parsed.registrationOpen,
        registrationClose: parsed.registrationClose,
        createdById: actor.id,
        eventFormats: {
          create: primary.formatIds.map((formatId) => ({ formatId })),
        },
        laps: {
          create: laps.map((lap) => ({
            lapNumber: lap.lapNumber,
            distanceKm: lap.distanceKm,
          })),
        },
        starts: {
          create: startConfigs.map((start) => ({
            purposeType: start.purposeType,
            lapCount: start.lapCount,
            lapLengthMeters: start.lapLengthMeters,
            displayName: start.displayName,
            routeColor: start.routeColor,
            sortOrder: start.sortOrder,
            legacyEffectiveDistanceM: start.legacyEffectiveDistanceM,
            formats: {
              create: start.formatIds.map((formatId) => ({ formatId })),
            },
          })),
        },
      },
      include: {
        eventFormats: {
          include: { format: true },
        },
        laps: {
          orderBy: { lapNumber: 'asc' },
        },
        starts: {
          orderBy: { sortOrder: 'asc' },
          include: {
            formats: {
              include: { format: true },
            },
            _count: {
              select: {
                enrollments: { where: { status: 'REGISTERED' } },
              },
            },
          },
        },
      },
    });

    logEvent(this.logger, {
      event: 'event.created',
      eventId: created.id,
      userSub: authentikId,
      status: created.status,
    });
    return this.toResponse(
      created,
      mapEventFormats(created.eventFormats),
      mapEventLaps(created.laps),
      mapEventStarts(created.starts),
    );
  }

  async listFormats(sportRaw?: string): Promise<ParticipationFormatDto[]> {
    const sport = sportRaw?.trim();
    if (sport && !isSport(sport)) {
      throw new BadRequestException(
        'sport must be RUN, SKI, ROLLER_SKI or BIKE.',
      );
    }

    const rows = await this.prisma.participationFormat.findMany({
      where: sport && isSport(sport) ? { sport } : undefined,
      orderBy: [{ sport: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
    });

    return rows.map((row) => ({
      id: row.id,
      sport: row.sport,
      code: row.code,
      name: row.name,
      sortOrder: row.sortOrder,
    }));
  }

  async listRecent(
    fromRaw?: string,
    toRaw?: string,
  ): Promise<RecentEventRow[]> {
    await this.eventStatusSync.syncDueStatuses();
    const range = parseEventDateRange(fromRaw, toRaw);
    const rows = await this.store.event.findMany({
      where: {
        status: { not: 'CANCELLED' },
        ...(range ? { eventDate: { gte: range.from, lt: range.to } } : {}),
      },
      orderBy: [{ eventDate: 'asc' }, { createdAt: 'asc' }],
      include: {
        track: { select: { name: true } },
        starts: {
          orderBy: { sortOrder: 'asc' },
          include: {
            formats: {
              include: { format: true },
            },
            _count: {
              select: {
                enrollments: { where: { status: 'REGISTERED' } },
              },
            },
          },
        },
        _count: {
          select: {
            registrations: {
              where: { status: { in: [...LISTED_REGISTRATION_STATUSES] } },
            },
          },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      eventDate: row.eventDate.toISOString(),
      distanceKm: toKm(row.distanceKm),
      status: row.status,
      trackName: row.track.name,
      registeredCount: row._count.registrations,
      starts: mapCatalogStarts(row.starts),
    }));
  }

  async findById(
    id: string,
    options: { syncStatuses?: boolean; includeRegistrations?: boolean } = {},
  ): Promise<EventDetails> {
    if (options.syncStatuses !== false) {
      await this.eventStatusSync.syncDueStatuses();
    }
    const includeRegistrations = options.includeRegistrations !== false;
    const listedRegistrations = {
      status: { in: [...LISTED_REGISTRATION_STATUSES] },
    };
    const event = await this.store.event.findUnique({
      where: { id },
      include: {
        track: {
          select: {
            id: true,
            name: true,
            locationCity: true,
            mapLink: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            userName: true,
          },
        },
        eventFormats: {
          include: { format: true },
        },
        laps: {
          orderBy: { lapNumber: 'asc' },
        },
        starts: {
          orderBy: { sortOrder: 'asc' },
          include: {
            formats: {
              include: { format: true },
            },
            _count: {
              select: {
                enrollments: { where: { status: 'REGISTERED' } },
              },
            },
          },
        },
        _count: {
          select: { registrations: { where: listedRegistrations } },
        },
        ...(includeRegistrations
          ? {
              registrations: {
                where: listedRegistrations,
                orderBy: { registeredAt: 'asc' },
                select: {
                  id: true,
                  userId: true,
                  firstName: true,
                  lastName: true,
                  gender: true,
                  birthYear: true,
                  city: true,
                  district: true,
                  team: true,
                  formatId: true,
                  format: {
                    select: {
                      id: true,
                      code: true,
                      name: true,
                      sortOrder: true,
                    },
                  },
                  startNumber: true,
                  status: true,
                  note: true,
                  registeredAt: true,
                  result: {
                    select: {
                      timeMilliseconds: true,
                      place: true,
                      laps: {
                        select: {
                          timeMilliseconds: true,
                          eventLap: { select: { lapNumber: true } },
                        },
                      },
                    },
                  },
                  enrollments: {
                    where: { status: 'REGISTERED' },
                    orderBy: { createdAt: 'asc' },
                    select: {
                      id: true,
                      startId: true,
                      formatId: true,
                      status: true,
                      start: {
                        select: {
                          id: true,
                          purposeType: true,
                          lapCount: true,
                          lapLengthMeters: true,
                          displayName: true,
                          routeColor: true,
                          sortOrder: true,
                          legacyEffectiveDistanceM: true,
                          formats: {
                            select: {
                              format: {
                                select: {
                                  id: true,
                                  code: true,
                                  name: true,
                                  sortOrder: true,
                                },
                              },
                            },
                          },
                        },
                      },
                      result: {
                        select: {
                          outcome: true,
                          timeMilliseconds: true,
                          place: true,
                        },
                      },
                    },
                  },
                },
              },
            }
          : {}),
      },
    });

    if (!event) {
      throw new NotFoundException('Event not found.');
    }

    const hasStarts = (event.starts ?? []).length > 0;
    const readsAgeCategories = includeRegistrations && hasStarts;

    const [
      finishedCategories,
      storedSections,
      storedCategories,
      classCompetitions,
    ] = await Promise.all([
      this.prisma.categoryFinish.findMany({
        where: { eventId: id },
        select: { startId: true, formatId: true, gender: true },
        orderBy: [{ startId: 'asc' }, { formatId: 'asc' }, { gender: 'asc' }],
      }),
      readsAgeCategories
        ? this.readStoredAgeSections(id)
        : Promise.resolve<StoredAgeSplitRow[]>([]),
      readsAgeCategories
        ? this.readStoredAgeCategories(id)
        : Promise.resolve<StoredAgeCategoryRow[]>([]),
      readsAgeCategories
        ? this.readClassCompetitions(id)
        : Promise.resolve<StoredClassCompetitionRow[]>([]),
    ]);

    const protocol = event.registrations
      ? this.toProtocolParticipants(event.registrations, {
          categoriesByCategory: categoriesByCategory(
            storedCategories,
            storedSections,
          ),
          racesByCategory: groupClassCompetitions(classCompetitions),
          controlYear: resolveControlYear(event.eventDate),
        })
      : null;

    return {
      id: event.id,
      name: event.name,
      eventType: event.eventType,
      sport: event.sport,
      eventDate: event.eventDate.toISOString(),
      distanceKm: toKm(event.distanceKm),
      description: event.description,
      mapLink: event.mapLink,
      registrationOpen: event.registrationOpen?.toISOString() ?? null,
      registrationClose: event.registrationClose?.toISOString() ?? null,
      status: event.status,
      createdAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
      track: event.track,
      createdBy: event.createdBy
        ? {
            id: event.createdBy.id,
            name: this.formatPersonName(
              event.createdBy.firstName,
              event.createdBy.lastName,
              event.createdBy.userName,
            ),
          }
        : null,
      formats: mapEventFormats(event.eventFormats),
      laps: mapEventLaps(event.laps),
      starts: mapEventStarts(event.starts),
      registrations: protocol ? protocol.registrations : null,
      registeredCount: event._count.registrations,
      finishedCategories,
      ageSplits: protocol && hasStarts ? protocol.ageSplits : undefined,
    };
  }

  private async readStoredAgeSections(
    eventId: string,
  ): Promise<StoredAgeSplitRow[]> {
    const rows = await this.store.ageSplitSection?.findMany({
      where: { eventId },
      select: {
        startId: true,
        formatId: true,
        gender: true,
        sectionId: true,
        sectionKind: true,
        sortOrder: true,
      },
      orderBy: [
        { startId: 'asc' },
        { formatId: 'asc' },
        { gender: 'asc' },
        { sortOrder: 'asc' },
      ],
    });
    return rows ?? [];
  }

  private async readStoredAgeCategories(
    eventId: string,
  ): Promise<StoredAgeCategoryRow[]> {
    const rows = await this.store.ageSplitCategory?.findMany({
      where: { eventId },
      select: {
        startId: true,
        formatId: true,
        gender: true,
        categoryNumber: true,
        groupId: true,
      },
      orderBy: [
        { startId: 'asc' },
        { formatId: 'asc' },
        { gender: 'asc' },
        { categoryNumber: 'asc' },
        { groupId: 'asc' },
      ],
    });
    return rows ?? [];
  }

  private async readClassCompetitions(
    eventId: string,
  ): Promise<StoredClassCompetitionRow[]> {
    const rows = await this.store.classCompetition?.findMany({
      where: { eventId },
      select: {
        id: true,
        startId: true,
        formatId: true,
        gender: true,
        status: true,
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
    });
    return rows ?? [];
  }

  async finishCategory(
    authentikId: string | undefined,
    eventId: string,
    body: unknown,
  ): Promise<EventDetails> {
    await this.rolesService.assertHasAnyRole(authentikId, ADMIN_ROLE_CODES);
    const parsed = parseFinishCategoryBody(body);
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        status: true,
        eventDate: true,
        starts: {
          select: {
            id: true,
            formats: { select: { formatId: true } },
          },
        },
      },
    });
    if (!event) throw new NotFoundException('Event not found.');
    if (event.status === 'CANCELLED') {
      throw new BadRequestException(
        'Нельзя завершить гонку отменённого мероприятия.',
      );
    }
    if (isPastCompletedEvent(event.status, event.eventDate)) {
      throw new BadRequestException(PAST_COMPLETED_EVENT_LOCKED_MESSAGE);
    }

    const start = event.starts.find((row) => row.id === parsed.startId);
    if (!start) {
      throw new BadRequestException('Старт не принадлежит этому мероприятию.');
    }
    const formats = start.formats.map((row) => row.formatId);
    if (formats.length === 0) {
      if (parsed.formatId != null) {
        throw new BadRequestException('У мероприятия нет форматов участия.');
      }
    } else if (parsed.formatId == null || !formats.includes(parsed.formatId)) {
      throw new BadRequestException('Такой формат не заявлен на этом старте.');
    }
    if (parsed.formatId == null) {
      throw new BadRequestException('formatId is required.');
    }
    const formatId = parsed.formatId;

    const bracket = (await this.readClassCompetitions(eventId)).filter(
      (row) =>
        row.startId === parsed.startId &&
        row.formatId === formatId &&
        row.gender === parsed.gender,
    );
    if (bracket.some((row) => row.status !== 'DONE')) {
      throw new BadRequestException(
        'Это многоэтапная гонка. Она завершается на последнем этапе.',
      );
    }
    if (
      await categoryIsFinished(
        this.prisma,
        eventId,
        formatId,
        parsed.gender,
        parsed.startId,
      )
    ) {
      throw new ConflictException('Гонка в этой категории уже завершена.');
    }

    const controlYear = resolveControlYear(event.eventDate);
    const storedCategories = await this.readStoredAgeCategories(eventId);
    const storedSections = await this.readStoredAgeSections(eventId);
    const categories =
      categoriesByCategory(storedCategories, storedSections).get(
        categoryKey(parsed.startId, formatId, parsed.gender),
      ) ?? [];
    const scopedRaces =
      groupClassCompetitions(bracket).get(
        categoryKey(parsed.startId, formatId, parsed.gender),
      ) ?? [];

    await this.prisma.$transaction(async (tx) => {
      const enrollments = await tx.enrollment.findMany({
        where: {
          eventId,
          startId: parsed.startId,
          formatId,
          status: 'REGISTERED',
          registration: {
            gender: parsed.gender,
            status: { in: [...LISTED_REGISTRATION_STATUSES] },
          },
        },
        select: {
          id: true,
          startId: true,
          formatId: true,
          status: true,
          registration: {
            select: {
              id: true,
              gender: true,
              birthYear: true,
              startNumber: true,
              status: true,
              registeredAt: true,
            },
          },
          result: {
            select: { outcome: true, timeMilliseconds: true, place: true },
          },
        },
      });
      const simpleEnrollments = enrollments.filter((row) => {
        const placement = currentPlacement(
          row.registration.birthYear,
          controlYear,
          categories,
        );
        return (
          racePlacementForRow(scopedRaces, {
            enrollmentId: row.id,
            registrationId: row.registration.id,
            placement,
          }) == null
        );
      });
      if (enrollments.length === 0) {
        throw new BadRequestException(
          'В этой категории нет участников для завершения.',
        );
      }
      if (simpleEnrollments.length > 0) {
        const missing = simpleEnrollments.some(
          (row) =>
            isRankedRegistrationStatus(row.registration.status) &&
            row.result === null,
        );
        if (missing) {
          throw new BadRequestException(
            'Перед завершением гонки укажите результат каждому участнику, который занимает место, либо поставьте DNS, DNF, DSQ или NQ.',
          );
        }
        const ranked = rankEnrollments(
          simpleEnrollments.map((row) => ({
            enrollmentId: row.id,
            registrationId: row.registration.id,
            startId: row.startId,
            formatId: row.formatId,
            gender: row.registration.gender,
            startNumber: row.registration.startNumber,
            registeredAt: row.registration.registeredAt,
            outcome: row.result?.outcome ?? null,
            timeMilliseconds: row.result?.timeMilliseconds ?? null,
            enrollmentStatus: row.status,
          })),
        );
        for (const { enrollment, place } of ranked) {
          if (place == null) continue;
          await tx.result.update({
            where: { enrollmentId: enrollment.enrollmentId },
            data: { place },
          });
        }
      }
      await tx.categoryFinish.create({
        data: {
          eventId,
          startId: parsed.startId,
          formatId,
          gender: parsed.gender,
        },
      });
    });

    return this.findById(eventId, { syncStatuses: false });
  }

  async update(
    authentikId: string | undefined,
    eventId: string,
    body: unknown,
  ): Promise<EventDetails> {
    await this.assertCanManageCreatedEvent(authentikId, eventId);
    const parsed: ParsedCreateEvent = parseCreateEventBody(body);
    const startsPatch = parseUpdateEventBody(body);

    const current = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        sport: true,
        eventFormats: { select: { formatId: true } },
        laps: { select: { id: true, lapNumber: true } },
      },
    });
    if (!current) {
      throw new NotFoundException('Event not found.');
    }

    if (current.sport !== parsed.sport) {
      const activeCount = await this.prisma.registration.count({
        where: {
          eventId,
          status: { in: [...LISTED_REGISTRATION_STATUSES] },
        },
      });
      if (activeCount > 0) {
        throw new BadRequestException(
          'Cannot change sport while the event has registrations.',
        );
      }
    }

    if (startsPatch.starts !== undefined) {
      return this.applyStartsUpdate(
        authentikId,
        eventId,
        parsed,
        startsPatch.starts,
        current,
      );
    }

    const formatIds = await this.resolveFormatIds(
      parsed.sport,
      parsed.formatIds,
    );

    const existingIds = current.eventFormats.map((row) => row.formatId);
    const toRemove = existingIds.filter((id) => !formatIds.includes(id));
    const toAdd = formatIds.filter((id) => !existingIds.includes(id));

    if (toRemove.length > 0) {
      const inUse = await this.prisma.registration.findFirst({
        where: {
          eventId,
          formatId: { in: toRemove },
          status: { in: [...LISTED_REGISTRATION_STATUSES] },
        },
        select: { id: true },
      });
      if (inUse) {
        throw new BadRequestException(
          'Cannot remove a format that already has registrations.',
        );
      }
    }

    const currentLapNumbers = current.laps
      .map((lap) => lap.lapNumber)
      .sort((a, b) => a - b);
    const incomingLapNumbers = parsed.laps.map((lap) => lap.lapNumber);
    const sameLapStructure =
      currentLapNumbers.length === incomingLapNumbers.length &&
      currentLapNumbers.every(
        (lapNumber, index) => lapNumber === incomingLapNumbers[index],
      );

    if (!sameLapStructure) {
      const resultCount = await this.prisma.result.count({
        where: { registration: { eventId } },
      });
      if (resultCount > 0) {
        throw new BadRequestException(
          'Cannot change laps while the event has results.',
        );
      }
    }

    await this.prisma.$transaction([
      this.prisma.event.update({
        where: { id: eventId },
        data: {
          name: parsed.name,
          eventType: parsed.eventType,
          sport: parsed.sport,
          eventDate: parsed.eventDate,
          distanceKm: parsed.distanceKm,
          description: parsed.description,
          mapLink: parsed.mapLink,
          registrationOpen: parsed.registrationOpen,
          registrationClose: parsed.registrationClose,
        },
      }),
      ...(toRemove.length > 0
        ? [
            this.prisma.eventFormat.deleteMany({
              where: { eventId, formatId: { in: toRemove } },
            }),
          ]
        : []),
      ...(toAdd.length > 0
        ? [
            this.prisma.eventFormat.createMany({
              data: toAdd.map((formatId) => ({ eventId, formatId })),
            }),
          ]
        : []),
      ...(sameLapStructure
        ? parsed.laps.map((lap) =>
            this.prisma.eventLap.update({
              where: {
                eventId_lapNumber: { eventId, lapNumber: lap.lapNumber },
              },
              data: { distanceKm: lap.distanceKm },
            }),
          )
        : [
            this.prisma.eventLap.deleteMany({ where: { eventId } }),
            this.prisma.eventLap.createMany({
              data: parsed.laps.map((lap) => ({
                eventId,
                lapNumber: lap.lapNumber,
                distanceKm: lap.distanceKm,
              })),
            }),
          ]),
    ]);

    logEvent(this.logger, {
      event: 'event.updated',
      eventId,
      userSub: authentikId,
    });
    return this.findById(eventId);
  }

  private async applyStartsUpdate(
    authentikId: string | undefined,
    eventId: string,
    parsed: ParsedCreateEvent,
    incoming: ParsedStartInput[],
    current: {
      sport: string;
      eventFormats: { formatId: number }[];
      laps: { id: string; lapNumber: number }[];
    },
  ): Promise<EventDetails> {
    const incomingConfigs: StartConfig[] = incoming.map((start) => ({
      ...start,
      legacyEffectiveDistanceM: null,
    }));
    await this.resolveStartFormats(parsed.sport, incomingConfigs);

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM events WHERE id = ${eventId}::uuid FOR UPDATE`;

      const existingStarts = await tx.start.findMany({
        where: { eventId },
        include: {
          formats: { include: { format: true } },
          enrollments: { select: { formatId: true } },
        },
      });
      const existingById = new Map(
        existingStarts.map((start) => [start.id, start]),
      );

      const desired: StartConfig[] = [];
      for (const start of incomingConfigs) {
        if (!start.id) {
          desired.push(start);
          continue;
        }

        const existing = existingById.get(start.id);
        if (!existing) {
          throw new BadRequestException(
            `Start ${start.id} does not belong to this event.`,
          );
        }

        const hasEnrollments = (existing.enrollments ?? []).length > 0;
        const lapChanged =
          start.lapCount !== existing.lapCount ||
          start.lapLengthMeters !== existing.lapLengthMeters;
        if (
          hasEnrollments &&
          (start.purposeType !== existing.purposeType || lapChanged)
        ) {
          throw new BadRequestException(
            'Cannot change purpose or lap setup of a start with enrollments.',
          );
        }
        if (hasEnrollments) {
          const usedFormatIds = new Set(
            (existing.enrollments ?? []).map((row) => row.formatId),
          );
          for (const formatId of usedFormatIds) {
            if (!start.formatIds.includes(formatId)) {
              throw new BadRequestException(
                'Cannot remove a format used by an enrollment.',
              );
            }
          }
        }

        desired.push({
          ...start,
          legacyEffectiveDistanceM: lapChanged
            ? null
            : existing.legacyEffectiveDistanceM,
        });
      }

      const desiredIds = new Set(
        desired
          .map((start) => start.id)
          .filter((id): id is string => id !== undefined),
      );
      const removedStarts = existingStarts.filter(
        (start) => !desiredIds.has(start.id),
      );
      for (const start of removedStarts) {
        if ((start.enrollments ?? []).length > 0) {
          throw new BadRequestException(
            'Cannot remove a start that has enrollments.',
          );
        }
      }

      this.assertStartSetValid(desired);
      const primary = primaryStart(desired);
      const nextFormatIds = primary.formatIds;
      const projectedLaps = projectedEventLaps(primary);
      const removedFormatIds = current.eventFormats
        .map((row) => row.formatId)
        .filter((formatId) => !nextFormatIds.includes(formatId));

      if (removedFormatIds.length > 0) {
        const inUse = await tx.registration.findFirst({
          where: {
            eventId,
            formatId: { in: removedFormatIds },
            status: { in: [...LISTED_REGISTRATION_STATUSES] },
          },
          select: { id: true },
        });
        if (inUse) {
          throw new BadRequestException(
            'Cannot remove a format that already has registrations.',
          );
        }
      }

      const currentLapNumbers = current.laps
        .map((lap) => lap.lapNumber)
        .sort((left, right) => left - right);
      const nextLapNumbers = projectedLaps.map((lap) => lap.lapNumber);
      const sameLapStructure =
        currentLapNumbers.length === nextLapNumbers.length &&
        currentLapNumbers.every(
          (lapNumber, index) => lapNumber === nextLapNumbers[index],
        );

      if (!sameLapStructure) {
        const resultCount = await tx.result.count({
          where: { registration: { eventId } },
        });
        if (resultCount > 0) {
          throw new BadRequestException(
            'Cannot change the projected lap setup while the event has results.',
          );
        }
      }

      await tx.event.update({
        where: { id: eventId },
        data: {
          name: parsed.name,
          eventType: parsed.eventType,
          sport: parsed.sport,
          eventDate: parsed.eventDate,
          distanceKm: projectedEventDistanceKm(primary),
          description: parsed.description,
          mapLink: parsed.mapLink,
          registrationOpen: parsed.registrationOpen,
          registrationClose: parsed.registrationClose,
        },
      });

      const formatIdsToAdd = nextFormatIds.filter(
        (formatId) =>
          !current.eventFormats.some((row) => row.formatId === formatId),
      );
      if (removedFormatIds.length > 0) {
        await tx.eventFormat.deleteMany({
          where: { eventId, formatId: { in: removedFormatIds } },
        });
      }
      if (formatIdsToAdd.length > 0) {
        await tx.eventFormat.createMany({
          data: formatIdsToAdd.map((formatId) => ({ eventId, formatId })),
        });
      }

      if (sameLapStructure) {
        for (const lap of projectedLaps) {
          await tx.eventLap.update({
            where: {
              eventId_lapNumber: { eventId, lapNumber: lap.lapNumber },
            },
            data: { distanceKm: lap.distanceKm },
          });
        }
      } else {
        await tx.eventLap.deleteMany({ where: { eventId } });
        await tx.eventLap.createMany({
          data: projectedLaps.map((lap) => ({ eventId, ...lap })),
        });
      }

      if (removedStarts.length > 0) {
        await tx.start.deleteMany({
          where: {
            eventId,
            id: { in: removedStarts.map((start) => start.id) },
          },
        });
      }

      const reordered = desired.filter((start) => {
        if (!start.id) return false;
        const existing = existingById.get(start.id);
        return existing !== undefined && existing.sortOrder !== start.sortOrder;
      });
      if (reordered.length > 0) {
        let temporarySortOrder =
          Math.max(
            ...existingStarts.map((start) => start.sortOrder),
            ...desired.map((start) => start.sortOrder),
          ) +
          desired.length +
          1;
        for (const start of reordered) {
          await tx.start.update({
            where: { id: start.id as string },
            data: { sortOrder: temporarySortOrder },
          });
          temporarySortOrder += 1;
        }
      }

      for (const start of desired) {
        if (!start.id) {
          await tx.start.create({
            data: {
              eventId,
              purposeType: start.purposeType,
              lapCount: start.lapCount,
              lapLengthMeters: start.lapLengthMeters,
              displayName: start.displayName,
              routeColor: start.routeColor,
              sortOrder: start.sortOrder,
              legacyEffectiveDistanceM: start.legacyEffectiveDistanceM,
              formats: {
                create: start.formatIds.map((formatId) => ({ formatId })),
              },
            },
          });
          continue;
        }

        const existing = existingById.get(start.id) as NonNullable<
          ReturnType<typeof existingById.get>
        >;
        await tx.start.update({
          where: { id: start.id },
          data: {
            purposeType: start.purposeType,
            lapCount: start.lapCount,
            lapLengthMeters: start.lapLengthMeters,
            displayName: start.displayName,
            routeColor: start.routeColor,
            sortOrder: start.sortOrder,
            legacyEffectiveDistanceM: start.legacyEffectiveDistanceM,
          },
        });

        const existingFormatIds = existing.formats.map((row) => row.format.id);
        const formatIdsToRemoveStart = existingFormatIds.filter(
          (formatId) => !start.formatIds.includes(formatId),
        );
        const formatIdsToAddStart = start.formatIds.filter(
          (formatId) => !existingFormatIds.includes(formatId),
        );
        if (formatIdsToRemoveStart.length > 0) {
          await tx.startFormat.deleteMany({
            where: {
              startId: start.id,
              formatId: { in: formatIdsToRemoveStart },
            },
          });
        }
        if (formatIdsToAddStart.length > 0) {
          await tx.startFormat.createMany({
            data: formatIdsToAddStart.map((formatId) => ({
              startId: start.id as string,
              formatId,
            })),
          });
        }
      }
    });

    logEvent(this.logger, {
      event: 'event.updated',
      eventId,
      userSub: authentikId,
    });
    return this.findById(eventId);
  }

  private assertStartSetValid(starts: StartConfig[]): void {
    for (let left = 0; left < starts.length; left += 1) {
      for (let right = left + 1; right < starts.length; right += 1) {
        if (areStartsIdentical(starts[left], starts[right])) {
          throw new BadRequestException(
            'Two starts must not be fully identical.',
          );
        }
      }
    }

    const collisions = findStartLabelCollisions(
      starts.map(toStartNamingConfig),
    );
    if (collisions.length > 0) {
      throw new BadRequestException(
        `Start labels must be unique: ${collisions[0].labels.join(' / ')}.`,
      );
    }
  }

  private async resolveStartFormats(
    sport: string,
    starts: StartConfig[],
  ): Promise<void> {
    const catalog = await this.prisma.participationFormat.findMany({
      where: { sport: sport as 'RUN' | 'SKI' | 'ROLLER_SKI' | 'BIKE' },
      select: { id: true },
    });
    if (catalog.length === 0) {
      throw new BadRequestException('This sport has no participation formats.');
    }

    const allowed = new Set(catalog.map((row) => row.id));
    starts.forEach((start, index) => {
      for (const formatId of start.formatIds) {
        if (!allowed.has(formatId)) {
          throw new BadRequestException(
            `starts[${index}].formatIds must belong to the selected sport.`,
          );
        }
      }
    });
  }

  async updateStatus(
    authentikId: string | undefined,
    eventId: string,
    body: unknown,
  ): Promise<EventDetails> {
    await this.rolesService.assertAdminAccess(authentikId);
    const status = parseUpdateEventStatusBody(body);

    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, status: true, eventDate: true },
    });
    if (!event) {
      throw new NotFoundException('Event not found.');
    }
    if (event.status === status) {
      return this.findById(eventId, { syncStatuses: false });
    }
    if (isPastCompletedEvent(event.status, event.eventDate)) {
      throw new BadRequestException(PAST_COMPLETED_EVENT_LOCKED_MESSAGE);
    }

    if (status === EventStatusCode.CANCELLED) {
      await this.applyCancel(eventId);
    } else if (status === EventStatusCode.DONE) {
      await this.prisma.$transaction(async (tx) => {
        await tx.event.update({
          where: { id: eventId },
          data: { status },
        });
        await freezeEventPlaces(tx, eventId);
      });
    } else {
      await this.store.event.update({
        where: { id: eventId },
        data: { status },
      });
    }

    logEvent(this.logger, {
      event: 'event.status_changed',
      eventId,
      fromStatus: event.status,
      toStatus: status,
      userSub: authentikId,
    });
    return this.findById(eventId, { syncStatuses: false });
  }

  async cancel(
    authentikId: string | undefined,
    eventId: string,
  ): Promise<EventDetails> {
    await this.assertCanManageCreatedEvent(authentikId, eventId);
    await this.applyCancel(eventId);
    logEvent(this.logger, {
      event: 'event.cancelled',
      eventId,
      userSub: authentikId,
    });
    return this.findById(eventId, { syncStatuses: false });
  }

  async remove(
    authentikId: string | undefined,
    eventId: string,
  ): Promise<void> {
    await this.assertCanManageCreatedEvent(authentikId, eventId);
    await this.store.event.delete({ where: { id: eventId } });
    logEvent(this.logger, {
      event: 'event.deleted',
      eventId,
      userSub: authentikId,
    });
  }

  private async applyCancel(eventId: string): Promise<void> {
    await this.store.result.deleteMany({
      where: { registration: { eventId } },
    });
    await this.store.event.update({
      where: { id: eventId },
      data: { status: EventStatusCode.CANCELLED },
    });
    await this.store.registration.updateMany({
      where: {
        eventId,
        status: { in: [...LISTED_REGISTRATION_STATUSES] },
      },
      data: {
        status: RegistrationStatusCode.CANCELLED,
        startNumber: null,
      },
    });
  }

  private async assertCanManageCreatedEvent(
    authentikId: string | undefined,
    eventId: string,
  ) {
    await this.rolesService.assertHasAnyRole(authentikId, [
      RoleCode.ADMINISTRATOR,
    ]);

    const actor = await this.usersService.findBySub(authentikId as string);
    if (!actor) {
      throw new UnauthorizedException(
        'Not authenticated. Start with GET /auth/login.',
      );
    }

    const event = await this.store.event.findUnique({
      where: { id: eventId },
      select: { id: true, createdById: true, status: true },
    });
    if (!event) {
      throw new NotFoundException('Event not found.');
    }
    if (event.createdById !== actor.id) {
      throw new ForbiddenException(
        'Only the administrator who created this event can change it.',
      );
    }
    if (event.status !== 'PLANNED') {
      throw new BadRequestException(
        'Only a planned event can be edited or cancelled.',
      );
    }
  }

  private async resolveFormatIds(
    sport: string,
    formatIds: number[],
  ): Promise<number[]> {
    const catalog = await this.prisma.participationFormat.findMany({
      where: { sport: sport as 'RUN' | 'SKI' | 'ROLLER_SKI' | 'BIKE' },
      select: { id: true },
    });
    const allowed = new Set(catalog.map((row) => row.id));
    if (catalog.length === 0) {
      if (formatIds.length > 0) {
        throw new BadRequestException(
          'This sport has no participation formats.',
        );
      }
      return [];
    }
    if (formatIds.length === 0) {
      throw new BadRequestException('formatIds is required for this sport.');
    }
    for (const id of formatIds) {
      if (!allowed.has(id)) {
        throw new BadRequestException(
          'formatIds must belong to the selected sport.',
        );
      }
    }
    return formatIds;
  }

  private toResponse(
    event: StoredEvent,
    formats: EventFormatRef[] = [],
    laps: EventLapRef[] = [],
    starts: EventStartRef[] = [],
  ): EventResponse {
    return {
      id: event.id,
      trackId: event.trackId,
      name: event.name,
      eventType: event.eventType,
      sport: event.sport,
      eventDate: event.eventDate.toISOString(),
      distanceKm: toKm(event.distanceKm),
      description: event.description,
      mapLink: event.mapLink,
      registrationOpen: event.registrationOpen?.toISOString() ?? null,
      registrationClose: event.registrationClose?.toISOString() ?? null,
      status: event.status,
      createdBy: event.createdById,
      createdAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
      formats,
      laps,
      starts,
    };
  }

  private toProtocolParticipants(
    registrations: StoredRegistration[],
    context: ProtocolSectionContext,
  ): ProtocolView {
    const rows: ProtocolBaseRow[] = registrations.flatMap((registration) =>
      (registration.enrollments ?? [])
        .filter((enrollment) => enrollment.status === 'REGISTERED')
        .map((enrollment) => {
          const placement = this.resolveProtocolSection(
            enrollment.startId,
            enrollment.formatId,
            registration.gender,
            registration.birthYear,
            context,
          );
          const races =
            context.racesByCategory.get(
              categoryKey(
                enrollment.startId,
                enrollment.formatId,
                registration.gender,
              ),
            ) ?? [];
          const current = currentPlacement(
            registration.birthYear,
            context.controlYear,
            context.categoriesByCategory.get(
              categoryKey(
                enrollment.startId,
                enrollment.formatId,
                registration.gender,
              ),
            ) ?? [],
          );
          const racePlacement = racePlacementForRow(races, {
            enrollmentId: enrollment.id,
            registrationId: registration.id,
            placement: current,
          });
          return {
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
            registration,
            start: enrollment.start,
            format:
              enrollment.start.formats.find(
                (row) => row.format.id === enrollment.formatId,
              )?.format ?? null,
            sectionId: placement.sectionId,
            sectionRank: placement.sectionRank,
            ageGroupId: ageGroupFor(
              registration.birthYear,
              context.controlYear,
            ),
            raceId: racePlacement?.race.id ?? null,
            raceRole: racePlacement?.role ?? null,
          };
        }),
    );

    const placeByEnrollmentId = new Map<string, number | null>();
    for (const bucket of this.bucketBySection(rows).values()) {
      for (const ranked of rankEnrollments(bucket)) {
        placeByEnrollmentId.set(ranked.enrollment.enrollmentId, ranked.place);
      }
    }

    const ordered = rows
      .map((row) => ({
        ...row,
        place: placeByEnrollmentId.get(row.enrollmentId) ?? null,
      }))
      .sort(compareProtocolRows);

    return {
      registrations: ordered.map((row) => this.toParticipant(row)),
      ageSplits: this.toAgeSplits(ordered, context),
    };
  }

  /**
   * Places are recomputed per section, so every row is ranked inside its own
   * `start × format × gender × section` bucket.
   */
  private bucketBySection(
    rows: ProtocolBaseRow[],
  ): Map<string, ProtocolBaseRow[]> {
    const buckets = new Map<string, ProtocolBaseRow[]>();
    for (const row of rows) {
      if (row.raceId != null) continue;
      const key = `${row.startId}:${row.formatId}:${row.gender}:${row.sectionId}`;
      const bucket = buckets.get(key);
      if (bucket) bucket.push(row);
      else buckets.set(key, [row]);
    }
    return buckets;
  }

  private resolveProtocolSection(
    startId: string,
    formatId: number,
    gender: string,
    birthYear: number | null,
    context: ProtocolSectionContext,
  ): { sectionId: string; sectionRank: number } {
    const categories = context.categoriesByCategory.get(
      categoryKey(startId, formatId, gender),
    );
    const races = context.racesByCategory.get(
      categoryKey(startId, formatId, gender),
    );
    if (races?.some((race) => race.targetWholeCategory)) {
      return {
        sectionId: CATEGORY_SECTION_ID,
        sectionRank: CATEGORY_SECTION_RANK,
      };
    }
    if (!categories || categories.length === 0) {
      return {
        sectionId: CATEGORY_SECTION_ID,
        sectionRank: CATEGORY_SECTION_RANK,
      };
    }

    const sectionId = categoryForBirthYear(
      birthYear,
      context.controlYear,
      categories,
    );
    return {
      sectionId,
      sectionRank: sectionRankFor(sectionId),
    };
  }

  private toParticipant(row: ProtocolRow): EventParticipant {
    const registration = row.registration;
    const start = row.start;
    return {
      id: registration.id,
      enrollmentId: row.enrollmentId,
      startId: row.startId,
      startLabel: resolveStartLabel({
        purposeType: start.purposeType as StartPurposeTypeCode,
        lapCount: start.lapCount,
        lapLengthMeters: start.lapLengthMeters,
        legacyEffectiveDistanceM: start.legacyEffectiveDistanceM,
        displayName: start.displayName,
      }),
      sortOrder: start.sortOrder,
      enrollmentStatus: row.enrollmentStatus,
      userId: registration.userId,
      fullName: this.formatPersonName(
        registration.firstName,
        registration.lastName,
        'Участник',
      ),
      birthYear: registration.birthYear,
      gender: registration.gender,
      city: registration.city,
      district: registration.district,
      team: registration.team,
      startNumber: registration.startNumber,
      finishTimeMs: row.outcome === 'FINISHED' ? row.timeMilliseconds : null,
      outcome: row.outcome,
      place: row.place,
      format: row.format ? toFormatRef(row.format) : null,
      laps: [],
      status: registration.status,
      isCupEligible: start.purposeType === 'CUP_RACE',
      note: registration.note,
      registeredAt: registration.registeredAt.toISOString(),
      sectionId: row.sectionId,
      ageGroupId: row.ageGroupId,
      raceId: row.raceId,
      raceRole: row.raceRole,
    };
  }

  private toAgeSplits(
    rows: readonly ProtocolRow[],
    context: ProtocolSectionContext,
  ): AgeCategoriesRef[] {
    const seen = new Set<string>();
    const splits: AgeCategoriesRef[] = [];
    for (const row of rows) {
      const key = categoryKey(row.startId, row.formatId, row.gender);
      if (seen.has(key)) continue;
      seen.add(key);
      const categories = context.categoriesByCategory.get(key) ?? [];
      splits.push({
        startId: row.startId,
        formatId: row.formatId,
        gender: toProtocolGender(row.gender),
        enabled: categories.length > 0,
        categories: categories.map((category) => ({
          id: categorySectionId(category.number),
          number: category.number,
          title: categoryTitle(category.number),
          subtitle: categorySubtitle(category.groupIds),
          groupIds: [...category.groupIds],
        })),
      });
    }
    return splits;
  }

  private formatPersonName(
    firstName: string | null,
    lastName: string | null,
    fallback: string,
  ): string {
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
    return fullName || fallback;
  }
}
