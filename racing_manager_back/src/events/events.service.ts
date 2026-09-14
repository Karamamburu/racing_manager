import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { RoleCode } from '../auth/role-codes';
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
} from './parse-create-event';
import { EventStatusCode } from './event-status';
import { EventStatusSyncService } from './event-status-sync.service';
import { parseUpdateEventStatusBody } from './parse-update-event-status';

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

export type EventResponse = {
  id: string;
  trackId: string;
  name: string;
  eventType: string;
  sport: string;
  eventDate: string;
  distanceKm: number | null;
  description: string | null;
  registrationOpen: string | null;
  registrationClose: string | null;
  status: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  formats: EventFormatRef[];
  laps: EventLapRef[];
};

export type RecentEventRow = {
  id: string;
  name: string;
  eventDate: string;
  distanceKm: number | null;
  status: string;
  trackName: string;
  registeredCount: number;
};

export type EventDetails = {
  id: string;
  name: string;
  eventType: string;
  sport: string;
  eventDate: string;
  distanceKm: number | null;
  description: string | null;
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
  registrations: EventParticipant[];
};

export type EventParticipant = {
  id: string;
  userId: string | null;
  fullName: string;
  birthYear: number | null;
  gender: string | null;
  city: string | null;
  district: string | null;
  team: string | null;
  startNumber: number | null;
  finishTimeMs: number | null;
  place: number | null;
  format: EventFormatRef | null;
  laps: { lapNumber: number; timeMilliseconds: number }[];
  status: string;
  note: string | null;
  registeredAt: string;
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

type StoredResultLap = {
  timeMilliseconds: number;
  eventLap: { lapNumber: number };
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
    timeMilliseconds: number;
    laps: StoredResultLap[];
  } | null;
};

type EventWithDetails = StoredEvent & {
  track: EventDetails['track'];
  createdBy: PersonRow | null;
  eventFormats: { format: StoredFormat }[];
  laps: StoredLap[];
  registrations: StoredRegistration[];
};

type EventOwnerRow = {
  id: string;
  createdById: string | null;
  status: string;
};

type EventsStore = {
  track: {
    findUnique: (args: {
      where: { id: string };
    }) => Promise<{ id: string } | null>;
  };
  event: {
    create: (args: {
      data: object;
      include?: object;
    }) => Promise<
      StoredEvent & {
        eventFormats?: { format: StoredFormat }[];
        laps?: StoredLap[];
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
  };
  registration: {
    updateMany: (args: { where: object; data: object }) => Promise<unknown>;
  };
  result: {
    deleteMany: (args: { where: object }) => Promise<unknown>;
  };
};

function isCompleteResult(
  registration: StoredRegistration,
  eventLapCount: number,
): boolean {
  if (!registration.result) return false;
  if (eventLapCount === 0) return true;
  return registration.result.laps.length === eventLapCount;
}

function isRankedCompleteResult(
  registration: StoredRegistration,
  eventLapCount: number,
): boolean {
  return (
    isRankedRegistrationStatus(registration.status) &&
    isCompleteResult(registration, eventLapCount)
  );
}

function compareRegistrationsByResult(
  a: StoredRegistration,
  b: StoredRegistration,
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

function mapParticipantLaps(
  laps: StoredResultLap[] | undefined,
): { lapNumber: number; timeMilliseconds: number }[] {
  return [...(laps ?? [])]
    .map((lap) => ({
      lapNumber: lap.eventLap.lapNumber,
      timeMilliseconds: lap.timeMilliseconds,
    }))
    .sort((a, b) => a.lapNumber - b.lapNumber);
}

@Injectable()
export class EventsService {
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
    const formatIds = await this.resolveFormatIds(parsed.sport, parsed.formatIds);
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
        distanceKm: parsed.distanceKm,
        description: parsed.description,
        registrationOpen: parsed.registrationOpen,
        registrationClose: parsed.registrationClose,
        createdById: actor.id,
        eventFormats: {
          create: formatIds.map((formatId) => ({ formatId })),
        },
        laps: {
          create: parsed.laps.map((lap) => ({
            lapNumber: lap.lapNumber,
            distanceKm: lap.distanceKm,
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
      },
    });

    return this.toResponse(
      created,
      mapEventFormats(created.eventFormats),
      mapEventLaps(created.laps),
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

  async listRecent(): Promise<RecentEventRow[]> {
    await this.eventStatusSync.syncDueStatuses();
    const rows = await this.store.event.findMany({
      where: { status: { not: 'CANCELLED' } },
      orderBy: [{ eventDate: 'asc' }, { createdAt: 'asc' }],
      include: {
        track: { select: { name: true } },
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
    }));
  }

  async findById(
    id: string,
    options: { syncStatuses?: boolean } = {},
  ): Promise<EventDetails> {
    if (options.syncStatuses !== false) {
      await this.eventStatusSync.syncDueStatuses();
    }
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
        registrations: {
          where: { status: { in: [...LISTED_REGISTRATION_STATUSES] } },
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
                laps: {
                  select: {
                    timeMilliseconds: true,
                    eventLap: { select: { lapNumber: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundException('Event not found.');
    }

    return {
      id: event.id,
      name: event.name,
      eventType: event.eventType,
      sport: event.sport,
      eventDate: event.eventDate.toISOString(),
      distanceKm: toKm(event.distanceKm),
      description: event.description,
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
      registrations: this.toRankedParticipants(
        event.registrations,
        event.laps.length,
      ),
    };
  }

  async update(
    authentikId: string | undefined,
    eventId: string,
    body: unknown,
  ): Promise<EventDetails> {
    await this.assertCanManageCreatedEvent(authentikId, eventId);
    const parsed: ParsedCreateEvent = parseCreateEventBody(body);
    const formatIds = await this.resolveFormatIds(parsed.sport, parsed.formatIds);

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

    return this.findById(eventId);
  }

  async updateStatus(
    authentikId: string | undefined,
    eventId: string,
    body: unknown,
  ): Promise<EventDetails> {
    await this.rolesService.assertAdminAccess(authentikId);
    const status = parseUpdateEventStatusBody(body);

    const event = await this.store.event.findUnique({
      where: { id: eventId },
      select: { id: true, createdById: true, status: true },
    });
    if (!event) {
      throw new NotFoundException('Event not found.');
    }
    if (event.status === status) {
      return this.findById(eventId, { syncStatuses: false });
    }

    if (status === EventStatusCode.CANCELLED) {
      await this.applyCancel(eventId);
    } else {
      await this.store.event.update({
        where: { id: eventId },
        data: { status },
      });
    }

    return this.findById(eventId, { syncStatuses: false });
  }

  async cancel(
    authentikId: string | undefined,
    eventId: string,
  ): Promise<EventDetails> {
    await this.assertCanManageCreatedEvent(authentikId, eventId);
    await this.applyCancel(eventId);
    return this.findById(eventId, { syncStatuses: false });
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
      registrationOpen: event.registrationOpen?.toISOString() ?? null,
      registrationClose: event.registrationClose?.toISOString() ?? null,
      status: event.status,
      createdBy: event.createdById,
      createdAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
      formats,
      laps,
    };
  }

  private toRankedParticipants(
    registrations: StoredRegistration[],
    eventLapCount: number,
  ): EventParticipant[] {
    const groups = new Map<string, StoredRegistration[]>();
    for (const registration of registrations) {
      const key = `${registration.formatId ?? 'none'}:${registration.gender}`;
      const group = groups.get(key);
      if (group) group.push(registration);
      else groups.set(key, [registration]);
    }

    const ranked: EventParticipant[] = [];
    for (const group of groups.values()) {
      const sorted = [...group].sort((a, b) =>
        compareRegistrationsByResult(a, b, eventLapCount),
      );
      let place = 0;
      for (const registration of sorted) {
        const finishTimeMs = registration.result?.timeMilliseconds ?? null;
        const earnsPlace = isRankedCompleteResult(registration, eventLapCount);
        if (earnsPlace) place += 1;
        ranked.push({
          id: registration.id,
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
          finishTimeMs,
          place: earnsPlace ? place : null,
          format: registration.format
            ? toFormatRef(registration.format)
            : null,
          laps: mapParticipantLaps(registration.result?.laps),
          status: registration.status,
          note: registration.note,
          registeredAt: registration.registeredAt.toISOString(),
        });
      }
    }
    return ranked;
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
