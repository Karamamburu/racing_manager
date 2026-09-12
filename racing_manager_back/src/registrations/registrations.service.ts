import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ADMIN_ROLE_CODES } from '../auth/role-codes';
import { RolesService } from '../auth/roles.service';
import { UsersService, type AppUser } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  mergeRegistrationFields,
  parseCreateRegistrationBody,
  type ParsedCreateRegistration,
} from './parse-create-registration';
import { parseUpdateRegistrationBody } from './parse-update-registration';
import {
  ACTIVE_REGISTRATION_STATUSES,
  isActiveRegistrationStatus,
  RegistrationStatusCode,
} from './registration-status';

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
  formatId: number | null;
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
  formatId: number | null;
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
  eventFormats: { formatId: number }[];
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
        eventFormats: { select: { formatId: true } };
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
  result: {
    deleteMany: (args: { where: { registrationId: string } }) => Promise<unknown>;
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
    private readonly rolesService: RolesService,
  ) {
    this.store = prisma as unknown as RegistrationsStore;
  }

  async create(
    authentikId: string | undefined,
    eventId: string,
    body: unknown,
  ): Promise<RegistrationResponse> {
    const actor = authentikId
      ? await this.requireAuthenticatedUser(authentikId)
      : null;
    const parsed = actor
      ? mergeRegistrationFields(actor, body)
      : parseCreateRegistrationBody(body);
    const event = await this.requirePlannedEvent(eventId);
    this.assertRegistrationWindow(event);
    const formatId = this.resolveFormatId(event, parsed.formatId);
    const payload = { ...parsed, formatId };

    if (actor) {
      const existing = await this.store.registration.findFirst({
        where: {
          eventId,
          userId: actor.id,
          status: { in: [...ACTIVE_REGISTRATION_STATUSES] },
        },
      });
      if (existing) {
        throw new ConflictException('Already registered for this event.');
      }

      const withdrawn = await this.store.registration.findFirst({
        where: {
          eventId,
          userId: actor.id,
          status: RegistrationStatusCode.WITHDRAWN,
        },
        orderBy: { registeredAt: 'desc' },
      });
      if (withdrawn) {
        const restored = await this.store.registration.update({
          where: { id: withdrawn.id },
          data: {
            ...payload,
            status: RegistrationStatusCode.REGISTERED,
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
          ...payload,
          status: RegistrationStatusCode.REGISTERED,
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
        status: { in: [...ACTIVE_REGISTRATION_STATUSES] },
      },
    });
    if (!existing) {
      throw new NotFoundException('Registration not found.');
    }

    await this.store.result.deleteMany({
      where: { registrationId: existing.id },
    });
    const withdrawn = await this.store.registration.update({
      where: { id: existing.id },
      data: {
        status: RegistrationStatusCode.WITHDRAWN,
        startNumber: null,
      },
    });
    return this.toResponse(withdrawn);
  }

  async update(
    authentikId: string | undefined,
    eventId: string,
    registrationId: string,
    body: unknown,
  ): Promise<RegistrationResponse> {
    await this.rolesService.assertHasAnyRole(authentikId, ADMIN_ROLE_CODES);
    const parsed = parseUpdateRegistrationBody(body);
    await this.requirePlannedEvent(eventId);

    const existing = await this.store.registration.findFirst({
      where: { id: registrationId, eventId },
    });
    if (!existing) {
      throw new NotFoundException('Registration not found.');
    }
    if (!isActiveRegistrationStatus(existing.status)) {
      throw new BadRequestException(
        'Only an active registration can be updated.',
      );
    }

    try {
      const updated = await this.store.registration.update({
        where: { id: existing.id },
        data: {
          startNumber: parsed.startNumber,
          status: RegistrationStatusCode.CONFIRMED,
        },
      });
      return this.toResponse(updated);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'Start number is already assigned on this event.',
        );
      }
      throw error;
    }
  }

  private async requireAuthenticatedUser(authentikId: string): Promise<AppUser> {
    const actor = await this.usersService.findBySub(authentikId);
    if (!actor) {
      throw new UnauthorizedException(
        'Not authenticated. Start with GET /auth/login.',
      );
    }
    return actor;
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
        eventFormats: { select: { formatId: true } },
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
    if (event.registrationClose && now > event.registrationClose.getTime()) {
      throw new BadRequestException('Registration is closed.');
    }
  }

  private resolveFormatId(
    event: EventRegistrationWindow,
    formatId: number | null,
  ): number | null {
    const enabled = event.eventFormats.map((row) => row.formatId);
    if (enabled.length === 0) {
      if (formatId != null) {
        throw new BadRequestException(
          'This event has no participation formats.',
        );
      }
      return null;
    }
    const resolved =
      formatId == null && enabled.length === 1 ? enabled[0] : formatId;
    if (resolved == null) {
      throw new BadRequestException('formatId is required.');
    }
    if (!enabled.includes(resolved)) {
      throw new BadRequestException(
        'formatId is not enabled for this event.',
      );
    }
    return resolved;
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
      formatId: row.formatId,
      startNumber: row.startNumber,
      status: row.status,
      note: row.note,
      registeredAt: row.registeredAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
