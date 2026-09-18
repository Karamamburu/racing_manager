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
import { EventStatusSyncService } from '../events/event-status-sync.service';
import {
  PAST_COMPLETED_EVENT_LOCKED_MESSAGE,
  isPastCompletedEvent,
} from '../events/event-status';
import {
  mergeRegistrationFields,
  parseCreateRegistrationBody,
  type ParsedCreateRegistration,
} from './parse-create-registration';
import { parseUpdateRegistrationBody } from './parse-update-registration';
import { parseUpdateRegistrationStatusBody } from './parse-update-registration-status';
import {
  ACTIVE_REGISTRATION_STATUSES,
  LISTED_REGISTRATION_STATUSES,
  clearsRegistrationOnStatus,
  isListedRegistrationStatus,
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
  format?: { name: string } | null;
};

type EventRegistrationWindow = {
  id: string;
  status: string;
  eventDate: Date;
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
        eventDate: true;
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
    private readonly eventStatusSync: EventStatusSyncService,
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
          status: { in: [...LISTED_REGISTRATION_STATUSES] },
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
    } else {
      const duplicate = await this.findActiveGuestPerson(eventId, payload);
      if (duplicate) {
        throw new ConflictException(this.duplicatePersonMessage(duplicate));
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
        if (!actor) {
          const duplicate = await this.findActiveGuestPerson(eventId, payload);
          if (duplicate) {
            throw new ConflictException(this.duplicatePersonMessage(duplicate));
          }
        }
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
    await this.requireAssignableEvent(eventId);

    const existing = await this.store.registration.findFirst({
      where: { id: registrationId, eventId },
    });
    if (!existing) {
      throw new NotFoundException('Registration not found.');
    }
    if (!isListedRegistrationStatus(existing.status)) {
      throw new BadRequestException(
        'Only a listed registration can be updated.',
      );
    }

    try {
      const updated = await this.store.registration.update({
        where: { id: existing.id },
        data: {
          startNumber: parsed.startNumber,
          ...(existing.status === RegistrationStatusCode.REGISTERED
            ? { status: RegistrationStatusCode.CONFIRMED }
            : {}),
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

  async updateStatus(
    authentikId: string | undefined,
    eventId: string,
    registrationId: string,
    body: unknown,
  ): Promise<RegistrationResponse> {
    await this.rolesService.assertHasAnyRole(authentikId, ADMIN_ROLE_CODES);
    const status = parseUpdateRegistrationStatusBody(body);
    await this.requireManageableEvent(eventId);

    const existing = await this.store.registration.findFirst({
      where: { id: registrationId, eventId },
    });
    if (!existing) {
      throw new NotFoundException('Registration not found.');
    }
    if (!isListedRegistrationStatus(existing.status)) {
      throw new BadRequestException(
        'Only a listed registration can change status.',
      );
    }
    if (existing.status === status) {
      return this.toResponse(existing);
    }

    if (clearsRegistrationOnStatus(status)) {
      await this.store.result.deleteMany({
        where: { registrationId: existing.id },
      });
      const cancelled = await this.store.registration.update({
        where: { id: existing.id },
        data: {
          status,
          startNumber: null,
        },
      });
      return this.toResponse(cancelled);
    }

    const updated = await this.store.registration.update({
      where: { id: existing.id },
      data: { status },
    });
    return this.toResponse(updated);
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
    await this.eventStatusSync.syncDueStatuses();
    const event = await this.store.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        status: true,
        eventDate: true,
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

  private async requireManageableEvent(
    eventId: string,
  ): Promise<EventRegistrationWindow> {
    await this.eventStatusSync.syncDueStatuses();
    const event = await this.store.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        status: true,
        eventDate: true,
        registrationOpen: true,
        registrationClose: true,
        eventFormats: { select: { formatId: true } },
      },
    });
    if (!event) {
      throw new NotFoundException('Event not found.');
    }
    if (event.status === 'CANCELLED') {
      throw new BadRequestException(
        'Cannot change registrations for a cancelled event.',
      );
    }
    if (isPastCompletedEvent(event.status, event.eventDate)) {
      throw new BadRequestException(PAST_COMPLETED_EVENT_LOCKED_MESSAGE);
    }
    return event;
  }

  private async requireAssignableEvent(
    eventId: string,
  ): Promise<EventRegistrationWindow> {
    const event = await this.requireManageableEvent(eventId);
    if (event.status !== 'PLANNED' && event.status !== 'IN_PROGRESS') {
      throw new BadRequestException(
        'Start numbers can be assigned only for a planned or in-progress event.',
      );
    }
    return event;
  }

  private assertRegistrationWindow(event: EventRegistrationWindow) {
    const now = Date.now();
    const closesAt = event.registrationClose
      ? Math.min(event.registrationClose.getTime(), event.eventDate.getTime())
      : event.eventDate.getTime();
    if (now > closesAt) {
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

  private async findActiveGuestPerson(
    eventId: string,
    person: Pick<ParsedCreateRegistration, 'firstName' | 'lastName' | 'birthYear'>,
  ): Promise<StoredRegistration | null> {
    return this.store.registration.findFirst({
      where: {
        eventId,
        userId: null,
        birthYear: person.birthYear,
        firstName: { equals: person.firstName, mode: 'insensitive' },
        lastName: { equals: person.lastName, mode: 'insensitive' },
        status: { in: [...LISTED_REGISTRATION_STATUSES] },
      },
      include: { format: { select: { name: true } } },
    });
  }

  private duplicatePersonMessage(row: StoredRegistration): string {
    const person = `${row.firstName} ${row.lastName} ${row.birthYear}`;
    const formatName = row.format?.name;
    if (formatName) {
      return `Участник «${person}» уже зарегистрирован на данное мероприятие в категории: ${formatName}.`;
    }
    return `Участник «${person}» уже зарегистрирован на данное мероприятие.`;
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
