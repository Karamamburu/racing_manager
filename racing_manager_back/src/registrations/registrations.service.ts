import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ADMIN_ROLE_CODES, RoleCode } from '../auth/role-codes';
import { RolesService } from '../auth/roles.service';
import { UsersService, type AppUser } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma, RegistrationStatus } from '../../generated/prisma';
import {
  categoryIsFinished,
  CATEGORY_FINISHED_MESSAGE,
} from '../events/category-finish';
import { EventStatusSyncService } from '../events/event-status-sync.service';
import {
  PAST_COMPLETED_EVENT_LOCKED_MESSAGE,
  isPastCompletedEvent,
} from '../events/event-status';
import {
  mergeRegistrationFields,
  parseCreateRegistrationBody,
  parseEnrollments,
  registrationFieldsFromProfile,
  type ParsedCreateRegistration,
  type ParsedEnrollment,
} from './parse-create-registration';
import { parseUpdateRegistrationBody } from './parse-update-registration';
import { parseUpdateRegistrationStatusBody } from './parse-update-registration-status';
import {
  buildTestPeople,
  guestPersonKey,
  type TestPerson,
} from './seed-test-people';
import { resolveControlYear } from '../events/age-groups';
import { logEvent } from '../logging/log-event';
import {
  ACTIVE_REGISTRATION_STATUSES,
  LISTED_REGISTRATION_STATUSES,
  clearsRegistrationOnStatus,
  isListedRegistrationStatus,
  RegistrationStatusCode,
} from './registration-status';

export type EnrollmentResponse = {
  id: string;
  registrationId: string;
  startId: string;
  formatId: number;
  status: string;
  isCupEligible: boolean;
};

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
  enrollments?: EnrollmentResponse[];
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

type EventStartForRegistration = {
  id: string;
  purposeType: string;
  formats: { formatId: number }[];
};

type EventRegistrationWindow = {
  id: string;
  status: string;
  eventDate: Date;
  registrationOpen: Date | null;
  registrationClose: Date | null;
  eventFormats: { formatId: number }[];
  starts: EventStartForRegistration[];
};

type ResolvedEnrollment = {
  startId: string;
  formatId: number;
  isCupEligible: boolean;
};

type RegistrationWritePayload = ParsedCreateRegistration & {
  eventId: string;
  userId: string | null;
  status: RegistrationStatus;
  startNumber: number | null;
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
        starts: {
          select: {
            id: true;
            purposeType: true;
            formats: { select: { formatId: true } };
          };
        };
      };
    }) => Promise<EventRegistrationWindow | null>;
  };
  registration: {
    findFirst: (args: object) => Promise<StoredRegistration | null>;
    create: (args: {
      data: RegistrationWritePayload;
    }) => Promise<StoredRegistration>;
    update: (args: {
      where: { id: string };
      data: object;
    }) => Promise<StoredRegistration>;
  };
  result: {
    deleteMany: (args: {
      where: { registrationId: string };
    }) => Promise<unknown>;
  };
};

function parseSeedTestRegistrationsBody(body: unknown): {
  count: number;
  gender: 'M' | 'F';
  startId: string;
  formatId: number;
} {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Request body must be a JSON object.');
  }
  const raw = body as Record<string, unknown>;
  if (
    typeof raw.count !== 'number' ||
    !Number.isInteger(raw.count) ||
    raw.count < 1 ||
    raw.count > 100
  ) {
    throw new BadRequestException('Количество заявок должно быть от 1 до 100.');
  }
  if (raw.gender !== 'M' && raw.gender !== 'F') {
    throw new BadRequestException('Укажите пол: мужской или женский.');
  }
  if (typeof raw.startId !== 'string' || !USER_ID_PATTERN.test(raw.startId)) {
    throw new BadRequestException('startId must be a UUID.');
  }
  if (
    typeof raw.formatId !== 'number' ||
    !Number.isInteger(raw.formatId) ||
    raw.formatId < 1
  ) {
    throw new BadRequestException('formatId must be a positive integer.');
  }
  return {
    count: raw.count,
    gender: raw.gender,
    startId: raw.startId,
    formatId: raw.formatId,
  };
}

const USER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseStaffRegistrationBody(body: unknown): {
  userId: string;
  enrollments: ParsedEnrollment[];
  startNumber: number | null;
} {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Request body must be a JSON object.');
  }
  const raw = body as Record<string, unknown>;
  if (typeof raw.userId !== 'string' || !USER_ID_PATTERN.test(raw.userId)) {
    throw new BadRequestException('userId must be a UUID.');
  }
  return {
    userId: raw.userId,
    enrollments: parseEnrollments(raw.enrollments),
    startNumber: readOptionalStartNumber(raw),
  };
}

function readOptionalStartNumber(raw: Record<string, unknown>): number | null {
  if (raw.startNumber == null || raw.startNumber === '') return null;
  const numeric =
    typeof raw.startNumber === 'number'
      ? raw.startNumber
      : Number(raw.startNumber);
  if (!Number.isInteger(numeric) || numeric < 1) {
    throw new BadRequestException(
      'startNumber must be an integer greater than 0.',
    );
  }
  return numeric;
}

function sameGuestPerson(
  row: { firstName: string; lastName: string; birthYear: number },
  payload: { firstName: string; lastName: string; birthYear: number },
): boolean {
  return (
    row.birthYear === payload.birthYear &&
    row.firstName.trim().toLowerCase() ===
      payload.firstName.trim().toLowerCase() &&
    row.lastName.trim().toLowerCase() === payload.lastName.trim().toLowerCase()
  );
}

const GUEST_ALREADY_REGISTERED =
  'Участник с таким именем, фамилией и годом рождения уже зарегистрирован на это мероприятие.';

function uniqueConstraintName(error: unknown): string {
  if (!error || typeof error !== 'object' || !('meta' in error)) return '';
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  if (typeof target === 'string') return target;
  if (Array.isArray(target)) return target.map(String).join(' ');
  return '';
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'P2002',
  );
}

@Injectable()
export class RegistrationsService {
  private readonly logger = new Logger(RegistrationsService.name);
  private readonly store: RegistrationsStore;

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly rolesService: RolesService,
    private readonly eventStatusSync: EventStatusSyncService,
  ) {
    this.store = prisma;
  }

  async create(
    authentikId: string | undefined,
    eventId: string,
    body: unknown,
  ): Promise<RegistrationResponse> {
    if (!authentikId) {
      throw new UnauthorizedException(
        'Not authenticated. Start with GET /auth/login.',
      );
    }
    const actor = await this.requireAuthenticatedUser(authentikId);
    const parsed = mergeRegistrationFields(actor, body);
    const event = await this.requirePlannedEvent(eventId);
    this.assertRegistrationWindow(event);
    const enrollments = this.resolveEnrollments(event, parsed.enrollments);
    return this.persistUserRegistration(eventId, actor.id, parsed, enrollments);
  }

  async searchUsersForRegistration(
    authentikId: string | undefined,
    eventId: string,
    query: string,
  ) {
    await this.rolesService.assertHasAnyRole(authentikId, ADMIN_ROLE_CODES);
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true },
    });
    if (!event) {
      throw new NotFoundException('Event not found.');
    }

    const users = await this.usersService.searchByIdentity(query);
    if (users.length === 0) return [];

    const registered = await this.prisma.registration.findMany({
      where: {
        eventId,
        userId: { in: users.map((user) => user.id) },
        status: { in: [...LISTED_REGISTRATION_STATUSES] },
      },
      select: { userId: true },
    });
    const registeredIds = new Set(
      registered.flatMap((row) => (row.userId ? [row.userId] : [])),
    );
    return users.map((user) => ({
      ...user,
      alreadyRegistered: registeredIds.has(user.id),
    }));
  }

  async createForParticipant(
    authentikId: string | undefined,
    eventId: string,
    body: unknown,
  ): Promise<RegistrationResponse> {
    await this.rolesService.assertHasAnyRole(authentikId, ADMIN_ROLE_CODES);
    const parsedBody = parseStaffRegistrationBody(body);
    const target = await this.usersService.findById(parsedBody.userId);
    if (!target) {
      throw new NotFoundException('User not found.');
    }
    if (
      !target.firstName ||
      !target.lastName ||
      !target.gender ||
      !target.birthDate
    ) {
      throw new BadRequestException(
        'Профиль пользователя не заполнен: нужны имя, фамилия, пол и дата рождения.',
      );
    }

    const parsed = registrationFieldsFromProfile(target);
    const event = await this.requireStaffRegistrationEvent(eventId);
    const enrollments = this.resolveEnrollments(event, parsedBody.enrollments);
    return this.persistUserRegistration(
      eventId,
      target.id,
      parsed,
      enrollments,
      authentikId,
      parsedBody.startNumber,
    );
  }

  async createGuest(
    authentikId: string | undefined,
    eventId: string,
    body: unknown,
  ): Promise<RegistrationResponse> {
    await this.rolesService.assertHasAnyRole(authentikId, ADMIN_ROLE_CODES);
    const parsed = parseCreateRegistrationBody(body);
    const startNumber = readOptionalStartNumber(
      body as Record<string, unknown>,
    );
    const event = await this.requireStaffRegistrationEvent(eventId);
    const enrollments = this.resolveEnrollments(event, parsed.enrollments);
    return this.persistGuestRegistration(
      eventId,
      parsed,
      enrollments,
      authentikId,
      startNumber,
    );
  }

  async seedTestRegistrations(
    authentikId: string | undefined,
    eventId: string,
    body: unknown,
  ): Promise<{ created: number }> {
    await this.rolesService.assertHasAnyRole(authentikId, [
      RoleCode.ADMINISTRATOR,
    ]);
    const parsed = parseSeedTestRegistrationsBody(body);
    const event = await this.requireAssignableEvent(eventId);

    const start = event.starts.find(
      (row) => row.id.toLowerCase() === parsed.startId.toLowerCase(),
    );
    if (!start) {
      throw new BadRequestException('startId does not belong to this event.');
    }
    if (!start.formats.some((row) => row.formatId === parsed.formatId)) {
      throw new BadRequestException(
        'formatId is not enabled on the selected start.',
      );
    }

    const existing = await this.prisma.registration.findMany({
      where: { eventId, userId: null },
      select: { firstName: true, lastName: true, birthYear: true },
    });
    let people: TestPerson[];
    try {
      people = buildTestPeople(
        parsed.count,
        parsed.gender,
        existing.map((row) =>
          guestPersonKey(row.firstName, row.lastName, row.birthYear),
        ),
        resolveControlYear(event.eventDate),
      );
    } catch {
      throw new BadRequestException(
        'Не удалось подобрать уникальные имена. Уменьшите количество.',
      );
    }

    const highest = await this.prisma.registration.aggregate({
      where: { eventId, startNumber: { not: null } },
      _max: { startNumber: true },
    });
    const firstNumber = (highest._max.startNumber ?? 0) + 1;

    await this.prisma.$transaction(async (tx) => {
      for (let index = 0; index < people.length; index += 1) {
        const person = people[index];
        const registration = await tx.registration.create({
          data: {
            eventId,
            userId: null,
            firstName: person.firstName,
            lastName: person.lastName,
            gender: parsed.gender,
            birthYear: person.birthYear,
            city: person.city,
            team: 'Тест',
            formatId: parsed.formatId,
            startNumber: firstNumber + index,
            status: RegistrationStatusCode.CONFIRMED,
            note: 'test',
          },
          select: { id: true },
        });
        await tx.enrollment.create({
          data: {
            eventId,
            registrationId: registration.id,
            startId: start.id,
            formatId: parsed.formatId,
            status: 'REGISTERED',
          },
        });
      }
    });

    return { created: people.length };
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

    await this.assertRegistrationHasNoResults(existing.id);
    const withdrawn = await this.prisma.$transaction(async (tx) => {
      await tx.enrollment.updateMany({
        where: { registrationId: existing.id },
        data: { status: 'WITHDRAWN' },
      });
      return tx.registration.update({
        where: { id: existing.id },
        data: {
          status: RegistrationStatusCode.WITHDRAWN,
          startNumber: null,
        },
      });
    });
    logEvent(this.logger, {
      event: 'registration.cancelled',
      eventId,
      registrationId: withdrawn.id,
      userId: actor.id,
      userSub: authentikId,
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
    const event = await this.requireAssignableEvent(eventId);

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

    const desiredEnrollments =
      parsed.enrollments !== undefined
        ? this.resolveEnrollments(event, parsed.enrollments)
        : null;

    if (parsed.startNumber !== undefined) {
      const enrolled = await this.prisma.enrollment.findMany({
        where: { registrationId: existing.id },
        select: { startId: true, formatId: true },
      });
      const [captured, wholeRace] = await Promise.all([
        this.prisma.classCompetition.findFirst({
          where: {
            eventId,
            capturedRegistrationIds: { has: existing.id },
          },
          select: { id: true },
        }),
        enrolled.length === 0
          ? Promise.resolve(null)
          : this.prisma.classCompetition.findFirst({
              where: {
                eventId,
                targetWholeCategory: true,
                gender: existing.gender as 'M' | 'F',
                OR: enrolled.map((item) => ({
                  startId: item.startId,
                  formatId: item.formatId,
                })),
              },
              select: { id: true },
            }),
      ]);
      if (captured || wholeRace) {
        throw new BadRequestException(
          'Стартовый номер нельзя менять, пока участник выступает в многоэтапной гонке.',
        );
      }
    }

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM registrations WHERE id = ${existing.id}::uuid FOR UPDATE`;
        const current = await tx.registration.findFirst({
          where: { id: existing.id, eventId },
        });
        if (!current) {
          throw new NotFoundException('Registration not found.');
        }

        if (desiredEnrollments !== null) {
          await this.applyEnrollmentDesiredSet(
            tx,
            eventId,
            current.id,
            desiredEnrollments,
          );
        }

        const data: { startNumber?: number; status?: RegistrationStatus } = {};
        if (parsed.startNumber !== undefined) {
          data.startNumber = parsed.startNumber;
          if (current.status === RegistrationStatusCode.REGISTERED) {
            data.status = RegistrationStatusCode.CONFIRMED;
          }
        }
        const registration =
          Object.keys(data).length > 0
            ? await tx.registration.update({
                where: { id: current.id },
                data,
              })
            : current;

        const enrollments = await tx.enrollment.findMany({
          where: { registrationId: registration.id },
          select: {
            id: true,
            registrationId: true,
            startId: true,
            formatId: true,
            status: true,
          },
          orderBy: { createdAt: 'asc' },
        });
        return { registration, enrollments };
      });
      logEvent(this.logger, {
        event: 'registration.updated',
        eventId,
        registrationId: updated.registration.id,
        userSub: authentikId,
        enrollmentsChanged: desiredEnrollments !== null,
      });
      return this.toResponse(
        updated.registration,
        updated.enrollments.map((row) => this.toEnrollmentResponse(event, row)),
      );
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
    if (
      await categoryIsFinished(
        this.prisma,
        eventId,
        existing.formatId,
        existing.gender,
      )
    ) {
      throw new BadRequestException(CATEGORY_FINISHED_MESSAGE);
    }

    if (clearsRegistrationOnStatus(status)) {
      await this.assertRegistrationHasNoResults(existing.id);
      const cancelled = await this.prisma.$transaction(async (tx) => {
        await tx.enrollment.updateMany({
          where: { registrationId: existing.id },
          data: { status: 'WITHDRAWN' },
        });
        return tx.registration.update({
          where: { id: existing.id },
          data: {
            status,
            startNumber: null,
          },
        });
      });
      logEvent(this.logger, {
        event: 'registration.status_changed',
        eventId,
        registrationId: cancelled.id,
        fromStatus: existing.status,
        toStatus: status,
        userSub: authentikId,
      });
      return this.toResponse(cancelled);
    }

    const updated = await this.store.registration.update({
      where: { id: existing.id },
      data: { status },
    });
    logEvent(this.logger, {
      event: 'registration.status_changed',
      eventId,
      registrationId: updated.id,
      fromStatus: existing.status,
      toStatus: status,
      userSub: authentikId,
    });
    return this.toResponse(updated);
  }

  private async persistUserRegistration(
    eventId: string,
    userId: string,
    payload: ParsedCreateRegistration,
    enrollments: ResolvedEnrollment[],
    registeredBy?: string,
    startNumber?: number | null,
  ): Promise<RegistrationResponse> {
    const assignedNumber = startNumber ?? null;
    const status = assignedNumber
      ? RegistrationStatusCode.CONFIRMED
      : RegistrationStatusCode.REGISTERED;
    const existing = await this.store.registration.findFirst({
      where: {
        eventId,
        userId,
        status: { in: [...LISTED_REGISTRATION_STATUSES] },
      },
    });
    if (existing) {
      throw new ConflictException('Already registered for this event.');
    }
    if (assignedNumber != null) {
      const taken = await this.store.registration.findFirst({
        where: { eventId, startNumber: assignedNumber },
      });
      if (taken) {
        throw new ConflictException('Этот стартовый номер уже занят.');
      }
    }

    const withdrawn = await this.store.registration.findFirst({
      where: {
        eventId,
        userId,
        status: RegistrationStatusCode.WITHDRAWN,
      },
      orderBy: { registeredAt: 'desc' },
    });

    const registrationData: RegistrationWritePayload = {
      eventId,
      userId,
      firstName: payload.firstName,
      lastName: payload.lastName,
      gender: payload.gender,
      birthYear: payload.birthYear,
      city: payload.city,
      district: payload.district,
      team: payload.team,
      formatId: enrollments[0].formatId,
      status,
      startNumber: assignedNumber,
    };

    try {
      const saved = await this.prisma.$transaction(async (tx) => {
        const registration = withdrawn
          ? await tx.registration.update({
              where: { id: withdrawn.id },
              data: { ...registrationData, registeredAt: new Date() },
            })
          : await tx.registration.create({ data: registrationData });
        const savedEnrollments = await this.upsertEnrollments(
          tx,
          eventId,
          registration.id,
          enrollments,
        );
        return { registration, enrollments: savedEnrollments };
      });
      logEvent(this.logger, {
        event: 'registration.created',
        eventId,
        registrationId: saved.registration.id,
        userId,
        ...(withdrawn ? { restored: true } : {}),
        startNumber: assignedNumber,
        ...(registeredBy ? { registeredBy } : {}),
      });
      return this.toResponse(saved.registration, saved.enrollments);
    } catch (error) {
      if (isUniqueViolation(error)) {
        const constraint = uniqueConstraintName(error);
        if (assignedNumber != null && constraint.includes('start_number')) {
          throw new ConflictException('Этот стартовый номер уже занят.');
        }
        throw new ConflictException('Already registered for this event.');
      }
      throw error;
    }
  }

  private async persistGuestRegistration(
    eventId: string,
    payload: ParsedCreateRegistration,
    enrollments: ResolvedEnrollment[],
    registeredBy: string | undefined,
    startNumber: number | null,
  ): Promise<RegistrationResponse> {
    const status = startNumber
      ? RegistrationStatusCode.CONFIRMED
      : RegistrationStatusCode.REGISTERED;
    const listed = await this.prisma.registration.findMany({
      where: {
        eventId,
        userId: null,
        birthYear: payload.birthYear,
        status: { in: [...LISTED_REGISTRATION_STATUSES] },
      },
    });
    if (listed.some((row) => sameGuestPerson(row, payload))) {
      throw new ConflictException(GUEST_ALREADY_REGISTERED);
    }
    if (startNumber != null) {
      const taken = await this.prisma.registration.findFirst({
        where: { eventId, startNumber },
      });
      if (taken) {
        throw new ConflictException('Этот стартовый номер уже занят.');
      }
    }

    const withdrawn = await this.prisma.registration.findMany({
      where: {
        eventId,
        userId: null,
        birthYear: payload.birthYear,
        status: RegistrationStatusCode.WITHDRAWN,
      },
      orderBy: { registeredAt: 'desc' },
    });
    const previous = withdrawn.find((row) => sameGuestPerson(row, payload));

    const registrationData: RegistrationWritePayload = {
      eventId,
      userId: null,
      firstName: payload.firstName,
      lastName: payload.lastName,
      gender: payload.gender,
      birthYear: payload.birthYear,
      city: payload.city,
      district: payload.district,
      team: payload.team,
      formatId: enrollments[0].formatId,
      status,
      startNumber,
    };

    try {
      const saved = await this.prisma.$transaction(async (tx) => {
        const registration = previous
          ? await tx.registration.update({
              where: { id: previous.id },
              data: { ...registrationData, registeredAt: new Date() },
            })
          : await tx.registration.create({ data: registrationData });
        const savedEnrollments = await this.upsertEnrollments(
          tx,
          eventId,
          registration.id,
          enrollments,
        );
        return { registration, enrollments: savedEnrollments };
      });
      logEvent(this.logger, {
        event: 'registration.created',
        eventId,
        registrationId: saved.registration.id,
        userId: null,
        startNumber,
        ...(previous ? { restored: true } : {}),
        ...(registeredBy ? { registeredBy } : {}),
      });
      return this.toResponse(saved.registration, saved.enrollments);
    } catch (error) {
      if (isUniqueViolation(error)) {
        const constraint = uniqueConstraintName(error);
        if (startNumber != null && constraint.includes('start_number')) {
          throw new ConflictException('Этот стартовый номер уже занят.');
        }
        throw new ConflictException(GUEST_ALREADY_REGISTERED);
      }
      throw error;
    }
  }

  private async upsertEnrollments(
    tx: Prisma.TransactionClient,
    eventId: string,
    registrationId: string,
    enrollments: ResolvedEnrollment[],
  ): Promise<EnrollmentResponse[]> {
    const rows: EnrollmentResponse[] = [];
    for (const enrollment of enrollments) {
      const saved = await tx.enrollment.upsert({
        where: {
          registrationId_startId: {
            registrationId,
            startId: enrollment.startId,
          },
        },
        create: {
          eventId,
          registrationId,
          startId: enrollment.startId,
          formatId: enrollment.formatId,
          status: 'REGISTERED',
        },
        update: {
          formatId: enrollment.formatId,
          status: 'REGISTERED',
        },
        select: {
          id: true,
          registrationId: true,
          startId: true,
          formatId: true,
          status: true,
        },
      });
      rows.push({
        id: saved.id,
        registrationId: saved.registrationId,
        startId: saved.startId,
        formatId: saved.formatId,
        status: saved.status,
        isCupEligible: enrollment.isCupEligible,
      });
    }
    return rows;
  }

  private async requireAuthenticatedUser(
    authentikId: string,
  ): Promise<AppUser> {
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
        starts: {
          select: {
            id: true,
            purposeType: true,
            formats: { select: { formatId: true } },
          },
        },
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

  private async requireStaffRegistrationEvent(
    eventId: string,
  ): Promise<EventRegistrationWindow> {
    const event = await this.requireManageableEvent(eventId);
    if (event.status !== 'PLANNED' && event.status !== 'IN_PROGRESS') {
      throw new BadRequestException(
        'Зарегистрировать участника можно только для мероприятия со статусом «Запланировано» или «В процессе».',
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
        starts: {
          select: {
            id: true,
            purposeType: true,
            formats: { select: { formatId: true } },
          },
        },
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

  private async applyEnrollmentDesiredSet(
    tx: Prisma.TransactionClient,
    eventId: string,
    registrationId: string,
    desired: ResolvedEnrollment[],
  ): Promise<void> {
    const existing = await tx.enrollment.findMany({
      where: { registrationId },
      select: {
        id: true,
        startId: true,
        formatId: true,
        status: true,
        result: { select: { id: true } },
      },
    });
    const desiredByStart = new Map(desired.map((row) => [row.startId, row]));

    for (const row of existing) {
      if (desiredByStart.has(row.startId)) continue;
      // Omitting an already WITHDRAWN row is the documented way to leave a
      // migrated WITHDRAWN+Result anomaly untouched.
      if (row.result && row.status === 'REGISTERED') {
        throw new BadRequestException(
          'Cannot withdraw an enrollment that has a result.',
        );
      }
    }
    for (const desiredRow of desired) {
      const row = existing.find((item) => item.startId === desiredRow.startId);
      if (!row?.result) continue;
      if (row.status === 'WITHDRAWN') {
        throw new BadRequestException(
          'Cannot reactivate an enrollment that has a result.',
        );
      }
      if (row.formatId !== desiredRow.formatId) {
        throw new BadRequestException(
          'Cannot change format on an enrollment that has a result.',
        );
      }
    }

    for (const row of existing) {
      if (desiredByStart.has(row.startId) || row.status !== 'REGISTERED') {
        continue;
      }
      await tx.enrollment.update({
        where: { id: row.id },
        data: { status: 'WITHDRAWN' },
      });
    }

    let registeredCount = 0;
    for (const desiredRow of desired) {
      const row = existing.find((item) => item.startId === desiredRow.startId);
      if (!row) {
        await tx.enrollment.create({
          data: {
            eventId,
            registrationId,
            startId: desiredRow.startId,
            formatId: desiredRow.formatId,
            status: 'REGISTERED',
          },
        });
        registeredCount += 1;
        continue;
      }
      if (row.result) {
        registeredCount += 1;
        continue;
      }
      if (row.status !== 'REGISTERED' || row.formatId !== desiredRow.formatId) {
        await tx.enrollment.update({
          where: { id: row.id },
          data: { status: 'REGISTERED', formatId: desiredRow.formatId },
        });
      }
      registeredCount += 1;
    }

    if (registeredCount === 0) {
      throw new BadRequestException(
        'At least one enrollment must remain REGISTERED; use the cancel route to cancel the registration.',
      );
    }
  }

  private async assertRegistrationHasNoResults(
    registrationId: string,
  ): Promise<void> {
    const result = await this.prisma.result.findFirst({
      where: { registrationId },
      select: { id: true },
    });
    if (result) {
      throw new BadRequestException(
        'Cannot cancel a registration that has results.',
      );
    }
  }

  private toEnrollmentResponse(
    event: EventRegistrationWindow,
    row: {
      id: string;
      registrationId: string;
      startId: string;
      formatId: number;
      status: string;
    },
  ): EnrollmentResponse {
    const start = event.starts.find(
      (item) => item.id.toLowerCase() === row.startId.toLowerCase(),
    );
    return {
      id: row.id,
      registrationId: row.registrationId,
      startId: row.startId,
      formatId: row.formatId,
      status: row.status,
      isCupEligible: start?.purposeType === 'CUP_RACE',
    };
  }

  private resolveEnrollments(
    event: EventRegistrationWindow,
    enrollments: ParsedEnrollment[],
  ): ResolvedEnrollment[] {
    if (event.starts.length === 0) {
      throw new BadRequestException('Event has no starts.');
    }
    const starts = new Map(
      event.starts.map((start) => [start.id.toLowerCase(), start]),
    );
    const seen = new Set<string>();
    return enrollments.map((enrollment, index) => {
      const startId = enrollment.startId.toLowerCase();
      if (seen.has(startId)) {
        throw new BadRequestException(
          'enrollments must not contain duplicate startId values.',
        );
      }
      seen.add(startId);
      const start = starts.get(startId);
      if (!start) {
        throw new BadRequestException(
          `enrollments[${index}].startId does not belong to this event.`,
        );
      }
      if (!start.formats.some((row) => row.formatId === enrollment.formatId)) {
        throw new BadRequestException(
          `enrollments[${index}].formatId is not enabled on the selected start.`,
        );
      }
      return {
        startId: start.id,
        formatId: enrollment.formatId,
        isCupEligible: start.purposeType === 'CUP_RACE',
      };
    });
  }

  private toResponse(
    row: StoredRegistration,
    enrollments?: EnrollmentResponse[],
  ): RegistrationResponse {
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
      ...(enrollments ? { enrollments } : {}),
    };
  }
}
