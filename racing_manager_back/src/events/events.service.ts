import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
  userId: string;
  fullName: string;
  birthYear: number | null;
  gender: string | null;
  city: string | null;
  district: string | null;
  team: string | null;
  status: string;
  note: string | null;
  registeredAt: string;
};

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rolesService: RolesService,
    private readonly usersService: UsersService,
  ) {}

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
    const track = await this.prisma.track.findUnique({
      where: { id: ALESHKINO_TRACK_ID },
    });
    if (!track) {
      throw new NotFoundException(
        'Track Алёшкино is not seeded. Apply db/migrate_roles.sql.',
      );
    }

    const created = await this.prisma.event.create({
      data: {
        trackId: ALESHKINO_TRACK_ID,
        name: parsed.name,
        eventType: parsed.eventType,
        sport: parsed.sport,
        eventDate: parsed.eventDate,
        distanceKm:
          parsed.distanceKm === null
            ? null
            : new Prisma.Decimal(parsed.distanceKm),
        description: parsed.description,
        registrationOpen: parsed.registrationOpen,
        registrationClose: parsed.registrationClose,
        createdById: actor.id,
      },
    });

    return this.toResponse(created);
  }

  async listRecent(): Promise<RecentEventRow[]> {
    const rows = await this.prisma.event.findMany({
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
      distanceKm:
        row.distanceKm === null ? null : Number(row.distanceKm.toString()),
      status: row.status,
      trackName: row.track.name,
      registeredCount: row._count.registrations,
    }));
  }

  async findById(id: string): Promise<EventDetails> {
    const event = await this.prisma.event.findUnique({
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
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                birthDate: true,
                gender: true,
                city: true,
                district: true,
                team: true,
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
      eventDate: event.eventDate.toISOString().slice(0, 10),
      distanceKm:
        event.distanceKm === null ? null : Number(event.distanceKm.toString()),
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
        userId: registration.user.id,
        fullName: this.formatPersonName(
          registration.user.firstName,
          registration.user.lastName,
          'Участник',
        ),
        birthYear: registration.user.birthDate
          ? registration.user.birthDate.getUTCFullYear()
          : null,
        gender: registration.user.gender,
        city: registration.user.city,
        district: registration.user.district,
        team: registration.user.team,
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

    await this.prisma.event.update({
      where: { id: eventId },
      data: {
        name: parsed.name,
        eventType: parsed.eventType,
        sport: parsed.sport,
        eventDate: parsed.eventDate,
        distanceKm:
          parsed.distanceKm === null
            ? null
            : new Prisma.Decimal(parsed.distanceKm),
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

    await this.prisma.event.update({
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

    const event = await this.prisma.event.findUnique({
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

  private toResponse(event: {
    id: string;
    trackId: string;
    name: string;
    eventType: string;
    sport: string;
    eventDate: Date;
    distanceKm: Prisma.Decimal | null;
    description: string | null;
    registrationOpen: Date | null;
    registrationClose: Date | null;
    status: string;
    createdById: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): EventResponse {
    return {
      id: event.id,
      trackId: event.trackId,
      name: event.name,
      eventType: event.eventType,
      sport: event.sport,
      eventDate: event.eventDate.toISOString().slice(0, 10),
      distanceKm:
        event.distanceKm === null ? null : Number(event.distanceKm.toString()),
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
