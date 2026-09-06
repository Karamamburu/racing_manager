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
  parseCreateEventBody,
  type ParsedCreateEvent,
} from './parse-create-event';

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

type EventWithDetails = StoredEvent & {
  track: EventDetails['track'];
  createdBy: PersonRow | null;
  registrations: Array<{
    id: string;
    userId: string | null;
    firstName: string;
    lastName: string;
    gender: string;
    birthYear: number;
    city: string | null;
    district: string | null;
    team: string | null;
    startNumber: number | null;
    status: string;
    note: string | null;
    registeredAt: Date;
  }>;
};

type EventOwnerRow = {
  id: string;
  createdById: string | null;
  status: string;
};

type EventWritePayload = {
  name: string;
  eventType: string;
  sport: string;
  eventDate: Date;
  distanceKm: number | null;
  description: string | null;
  registrationOpen: Date | null;
  registrationClose: Date | null;
};

type EventsStore = {
  track: {
    findUnique: (args: {
      where: { id: string };
    }) => Promise<{ id: string } | null>;
  };
  event: {
    create: (args: {
      data: EventWritePayload & { trackId: string; createdById: string };
    }) => Promise<StoredEvent>;
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
};

function toKm(value: DecimalValue): number | null {
  return value === null ? null : Number(value.toString());
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

@Injectable()
export class EventsService {
  private readonly store: EventsStore;

  constructor(
    prisma: PrismaService,
    private readonly rolesService: RolesService,
    private readonly usersService: UsersService,
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
      },
    });

    return this.toResponse(created);
  }

  async listRecent(): Promise<RecentEventRow[]> {
    const rows = await this.store.event.findMany({
      where: { status: { not: 'CANCELLED' } },
      orderBy: [{ eventDate: 'asc' }, { createdAt: 'asc' }],
      include: {
        track: { select: { name: true } },
        _count: {
          select: {
            registrations: {
              where: { status: { not: 'CANCELLED' } },
            },
          },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      eventDate: row.eventDate.toISOString().slice(0, 10),
      distanceKm: toKm(row.distanceKm),
      status: row.status,
      trackName: row.track.name,
      registeredCount: row._count.registrations,
    }));
  }

  async findById(id: string): Promise<EventDetails> {
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
        registrations: {
          where: { status: { not: 'CANCELLED' } },
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
            startNumber: true,
            status: true,
            note: true,
            registeredAt: true,
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
      eventDate: event.eventDate.toISOString().slice(0, 10),
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
      registrations: event.registrations.map((registration) => ({
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
        status: registration.status,
        note: registration.note,
        registeredAt: registration.registeredAt.toISOString(),
      })),
    };
  }

  async update(
    authentikId: string | undefined,
    eventId: string,
    body: unknown,
  ): Promise<EventDetails> {
    await this.assertCanManageCreatedEvent(authentikId, eventId);
    const parsed: ParsedCreateEvent = parseCreateEventBody(body);

    await this.store.event.update({
      where: { id: eventId },
      data: {
        name: parsed.name,
        eventType: asString(parsed.eventType),
        sport: asString(parsed.sport),
        eventDate: parsed.eventDate,
        distanceKm: parsed.distanceKm,
        description: parsed.description,
        registrationOpen: parsed.registrationOpen,
        registrationClose: parsed.registrationClose,
      },
    });

    return this.findById(eventId);
  }

  async cancel(
    authentikId: string | undefined,
    eventId: string,
  ): Promise<EventDetails> {
    await this.assertCanManageCreatedEvent(authentikId, eventId);

    await this.store.event.update({
      where: { id: eventId },
      data: { status: 'CANCELLED' },
    });

    return this.findById(eventId);
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

  private toResponse(event: StoredEvent): EventResponse {
    return {
      id: event.id,
      trackId: event.trackId,
      name: event.name,
      eventType: event.eventType,
      sport: event.sport,
      eventDate: event.eventDate.toISOString().slice(0, 10),
      distanceKm: toKm(event.distanceKm),
      description: event.description,
      registrationOpen: event.registrationOpen?.toISOString() ?? null,
      registrationClose: event.registrationClose?.toISOString() ?? null,
      status: event.status,
      createdBy: event.createdById,
      createdAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
    };
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
