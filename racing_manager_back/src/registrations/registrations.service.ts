import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  parseCreateRegistrationBody,
  type ParsedCreateRegistration,
} from './parse-create-registration';

export type RegistrationResponse = {
  id: string;
  eventId: string;
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
  registeredAt: string;
  updatedAt: string;
};

type StoredRegistration = {
  id: string;
  eventId: string;
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
  updatedAt: Date;
};

type EventRegistrationWindow = {
  id: string;
  status: string;
  registrationOpen: Date | null;
  registrationClose: Date | null;
};

type RegistrationWritePayload = ParsedCreateRegistration & {
  eventId: string;
  userId: string | null;
  status: string;
};

type RegistrationsStore = {
  event: {
    findUnique: (args: {
      where: { id: string };
      select: {
        id: true;
        status: true;
        registrationOpen: true;
        registrationClose: true;
      };
    }) => Promise<EventRegistrationWindow | null>;
  };
  registration: {
    findFirst: (args: object) => Promise<StoredRegistration | null>;
    create: (args: { data: RegistrationWritePayload }) => Promise<StoredRegistration>;
    update: (args: {
      where: { id: string };
      data: object;
    }) => Promise<StoredRegistration>;
  };
};

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: unknown }).code === 'P2002',
  );
}

@Injectable()
export class RegistrationsService {
  private readonly store: RegistrationsStore;

  constructor(
    prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {
    this.store = prisma as unknown as RegistrationsStore;
  }

  async create(
    authentikId: string | undefined,
    eventId: string,
    body: unknown,
  ): Promise<RegistrationResponse> {
    const parsed = parseCreateRegistrationBody(body);
    const event = await this.requirePlannedEvent(eventId);
    this.assertRegistrationWindow(event);

    const actor = authentikId
      ? await this.usersService.findBySub(authentikId)
      : null;

    if (actor) {
      const existing = await this.store.registration.findFirst({
        where: {
          eventId,
          userId: actor.id,
          status: { not: 'CANCELLED' },
        },
      });
      if (existing) {
        throw new ConflictException('Already registered for this event.');
      }

      const cancelled = await this.store.registration.findFirst({
        where: {
          eventId,
          userId: actor.id,
          status: 'CANCELLED',
        },
        orderBy: { registeredAt: 'desc' },
      });
      if (cancelled) {
        const restored = await this.store.registration.update({
          where: { id: cancelled.id },
          data: {
            ...parsed,
            status: 'CONFIRMED',
            startNumber: null,
            registeredAt: new Date(),
          },
        });
        return this.toResponse(restored);
      }
    }

    try {
      const created = await this.store.registration.create({
        data: {
          eventId,
          userId: actor?.id ?? null,
          ...parsed,
          status: 'CONFIRMED',
        },
      });
      return this.toResponse(created);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Already registered for this event.');
      }
      throw error;
    }
  }

  async cancelOwn(
    authentikId: string | undefined,
    eventId: string,
  ): Promise<RegistrationResponse> {
    if (!authentikId) {
      throw new UnauthorizedException(
        'Not authenticated. Start with GET /auth/login.',
      );
    }

    const actor = await this.usersService.findBySub(authentikId);
    if (!actor) {
      throw new UnauthorizedException(
        'Not authenticated. Start with GET /auth/login.',
      );
    }

    await this.requirePlannedEvent(eventId);

    const existing = await this.store.registration.findFirst({
      where: {
        eventId,
        userId: actor.id,
        status: { not: 'CANCELLED' },
      },
    });
    if (!existing) {
      throw new NotFoundException('Registration not found.');
    }

    const cancelled = await this.store.registration.update({
      where: { id: existing.id },
      data: { status: 'CANCELLED' },
    });
    return this.toResponse(cancelled);
  }

  private async requirePlannedEvent(
    eventId: string,
  ): Promise<EventRegistrationWindow> {
    const event = await this.store.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        status: true,
        registrationOpen: true,
        registrationClose: true,
      },
    });
    if (!event) {
      throw new NotFoundException('Event not found.');
    }
    if (event.status !== 'PLANNED') {
      throw new BadRequestException(
        'Registration is only available for a planned event.',
      );
    }
    return event;
  }

  private assertRegistrationWindow(event: EventRegistrationWindow) {
    const now = Date.now();
    if (event.registrationOpen && now < event.registrationOpen.getTime()) {
      throw new BadRequestException('Registration is not open yet.');
    }
    if (event.registrationClose && now > event.registrationClose.getTime()) {
      throw new BadRequestException('Registration is closed.');
    }
  }

  private toResponse(row: StoredRegistration): RegistrationResponse {
    return {
      id: row.id,
      eventId: row.eventId,
      userId: row.userId,
      firstName: row.firstName,
      lastName: row.lastName,
      gender: row.gender,
      birthYear: row.birthYear,
      city: row.city,
      district: row.district,
      team: row.team,
      startNumber: row.startNumber,
      status: row.status,
      note: row.note,
      registeredAt: row.registeredAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
