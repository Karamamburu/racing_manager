import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RolesService } from '../auth/roles.service';
import { ALESHKINO_TRACK_ID } from '../tracks/aleshkino';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { parseCreateEventBody } from './parse-create-event';

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

    const parsed = parseCreateEventBody(body);
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
}
