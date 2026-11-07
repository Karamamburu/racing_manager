import { ConflictException } from '@nestjs/common';
import { EventStatusSyncService } from '../events/event-status-sync.service';
import { RegistrationsService } from './registrations.service';
import { PrismaService } from '../prisma/prisma.service';
import { RolesService } from '../auth/roles.service';
import { UsersService } from '../users/users.service';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const START_A = '22222222-2222-4222-8222-222222222222';
const START_B = '33333333-3333-4333-8333-333333333333';
const TARGET_USER_ID = '44444444-4444-4444-8444-444444444444';

type FakeEnrollment = {
  id: string;
  eventId: string;
  registrationId: string;
  startId: string;
  formatId: number;
  status: string;
};

type FakeRegistration = {
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

type CreateData = Omit<FakeRegistration, 'id' | 'registeredAt' | 'updatedAt'>;

const actorProfile = {
  firstName: 'Анна',
  lastName: 'Тестова',
  gender: 'F',
  birthDate: '1990-05-01',
  city: 'Москва',
  district: null,
  team: null,
};

function futureDate(): Date {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
}

function makeHarness() {
  const state = {
    event: {
      id: EVENT_ID,
      status: 'PLANNED',
      eventDate: futureDate(),
      registrationOpen: null as Date | null,
      registrationClose: null as Date | null,
      eventFormats: [{ formatId: 1 }, { formatId: 2 }],
      starts: [
        {
          id: START_A,
          purposeType: 'CUP_RACE',
          formats: [{ formatId: 1 }, { formatId: 2 }],
        },
        {
          id: START_B,
          purposeType: 'CONTROL_TRAINING',
          formats: [{ formatId: 1 }],
        },
      ],
    },
    registrations: [] as FakeRegistration[],
    enrollments: [] as FakeEnrollment[],
    failNextRegistrationCreate: false,
  };

  function registrationRow(data: CreateData): FakeRegistration {
    return {
      ...data,
      id: `registration-${state.registrations.length + 1}`,
      registeredAt: new Date(),
      updatedAt: new Date(),
    };
  }

  const prisma: Record<string, unknown> = {
    event: {
      findUnique: jest.fn(() => Promise.resolve(state.event)),
    },
    registration: {
      findFirst: jest.fn(
        (args: {
          where: {
            eventId?: string;
            userId?: string | null;
            id?: string;
            startNumber?: number;
            status?: unknown;
          };
        }) => {
          const where = args.where;
          const found = state.registrations.find((row) => {
            if (where.id && row.id !== where.id) return false;
            if (where.eventId && row.eventId !== where.eventId) return false;
            if (where.userId !== undefined && row.userId !== where.userId) {
              return false;
            }
            if (
              where.startNumber !== undefined &&
              row.startNumber !== where.startNumber
            ) {
              return false;
            }
            return true;
          });
          return Promise.resolve(found ?? null);
        },
      ),
      findMany: jest.fn(
        (args: { where: { eventId?: string; userId?: string | null } }) =>
          Promise.resolve(
            state.registrations.filter((row) => {
              const where = args.where;
              if (where.eventId && row.eventId !== where.eventId) return false;
              if (where.userId !== undefined && row.userId !== where.userId) {
                return false;
              }
              return true;
            }),
          ),
      ),
      create: jest.fn((args: { data: CreateData }) => {
        if (state.failNextRegistrationCreate) {
          state.failNextRegistrationCreate = false;
          throw Object.assign(new Error('unique'), {
            code: 'P2002',
            meta: { target: 'idx_registrations_event_user_active' },
          });
        }
        const row = registrationRow(args.data);
        state.registrations.push(row);
        return Promise.resolve(row);
      }),
      update: jest.fn(
        (args: { where: { id: string }; data: Partial<CreateData> }) => {
          const row = state.registrations.find(
            (item) => item.id === args.where.id,
          );
          if (!row) throw new Error('Missing registration');
          Object.assign(row, args.data);
          return Promise.resolve(row);
        },
      ),
    },
    enrollment: {
      upsert: jest.fn(
        (args: {
          where: {
            registrationId_startId: {
              registrationId: string;
              startId: string;
            };
          };
          create: Omit<FakeEnrollment, 'id'>;
          update: { formatId: number; status: string };
        }) => {
          const { registrationId, startId } = args.where.registrationId_startId;
          const existing = state.enrollments.find(
            (row) =>
              row.registrationId === registrationId && row.startId === startId,
          );
          if (existing) {
            existing.formatId = args.update.formatId;
            existing.status = args.update.status;
            return Promise.resolve(existing);
          }
          const row = {
            ...args.create,
            id: `enrollment-${state.enrollments.length + 1}`,
          };
          state.enrollments.push(row);
          return Promise.resolve(row);
        },
      ),
    },
    result: { deleteMany: jest.fn(() => Promise.resolve({ count: 0 })) },
    $transaction: jest.fn((work: (client: unknown) => Promise<unknown>) =>
      work(prisma),
    ),
  };

  const users = {
    findBySub: jest.fn(() =>
      Promise.resolve({ id: 'actor-1', ...actorProfile }),
    ),
    findById: jest.fn(() =>
      Promise.resolve({ id: TARGET_USER_ID, ...actorProfile }),
    ),
  };
  const roles = {
    assertHasAnyRole: jest.fn(() => Promise.resolve(undefined)),
  };
  const sync = {
    syncDueStatuses: jest.fn(() => Promise.resolve(undefined)),
  };

  const service = new RegistrationsService(
    prisma as unknown as PrismaService,
    users as unknown as UsersService,
    roles as unknown as RolesService,
    sync as unknown as EventStatusSyncService,
  );

  return { service, state };
}

describe('RegistrationsService create with enrollments', () => {
  it('creates one registration and one REGISTERED enrollment for a single start', async () => {
    const { service, state } = makeHarness();

    const created = await service.create('sub', EVENT_ID, {
      enrollments: [{ startId: START_A, formatId: 1 }],
    });

    expect(created.enrollments).toEqual([
      expect.objectContaining({
        registrationId: created.id,
        startId: START_A,
        formatId: 1,
        status: 'REGISTERED',
        isCupEligible: true,
      }),
    ]);
    expect(state.registrations).toHaveLength(1);
    expect(state.enrollments).toHaveLength(1);
    expect(state.registrations[0].formatId).toBe(1);
    expect(created.formatId).toBe(1);
  });

  it('creates N enrollments for a multi-start registration', async () => {
    const { service, state } = makeHarness();

    const created = await service.create('sub', EVENT_ID, {
      enrollments: [
        { startId: START_A, formatId: 2 },
        { startId: START_B, formatId: 1 },
      ],
    });

    expect(created.enrollments).toHaveLength(2);
    expect(created.enrollments?.[1]).toMatchObject({
      startId: START_B,
      formatId: 1,
      isCupEligible: false,
    });
    expect(state.enrollments).toHaveLength(2);
  });

  it('rejects an empty enrollments array without creating rows', async () => {
    const { service, state } = makeHarness();

    await expect(
      service.create('sub', EVENT_ID, { enrollments: [] }),
    ).rejects.toThrow('enrollments is required.');
    expect(state.registrations).toHaveLength(0);
    expect(state.enrollments).toHaveLength(0);
  });

  it('rejects a start that does not belong to the event', async () => {
    const { service, state } = makeHarness();

    await expect(
      service.create('sub', EVENT_ID, {
        enrollments: [
          {
            startId: '99999999-9999-4999-8999-999999999999',
            formatId: 1,
          },
        ],
      }),
    ).rejects.toThrow('does not belong to this event.');
    expect(state.registrations).toHaveLength(0);
    expect(state.enrollments).toHaveLength(0);
  });

  it('rejects a format that is not enabled on the selected start', async () => {
    const { service, state } = makeHarness();

    await expect(
      service.create('sub', EVENT_ID, {
        enrollments: [{ startId: START_B, formatId: 2 }],
      }),
    ).rejects.toThrow('is not enabled on the selected start.');
    expect(state.registrations).toHaveLength(0);
    expect(state.enrollments).toHaveLength(0);
  });

  it('rejects duplicate startId values', async () => {
    const { service, state } = makeHarness();

    await expect(
      service.create('sub', EVENT_ID, {
        enrollments: [
          { startId: START_A, formatId: 1 },
          { startId: START_A, formatId: 2 },
        ],
      }),
    ).rejects.toThrow('duplicate startId');
    expect(state.registrations).toHaveLength(0);
  });

  it('maps a concurrent person-uniqueness violation to conflict', async () => {
    const { service, state } = makeHarness();
    state.failNextRegistrationCreate = true;

    await expect(
      service.create('sub', EVENT_ID, {
        enrollments: [{ startId: START_A, formatId: 1 }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(state.enrollments).toHaveLength(0);
  });

  it('applies the same enrollment rules to guest create', async () => {
    const { service, state } = makeHarness();

    const created = await service.createGuest('admin-sub', EVENT_ID, {
      firstName: 'Иван',
      lastName: 'Гостев',
      gender: 'M',
      birthYear: 1985,
      enrollments: [{ startId: START_A, formatId: 1 }],
    });

    expect(created.enrollments).toHaveLength(1);
    expect(state.registrations[0].userId).toBeNull();
  });

  it('rejects a second guest create for the same person key', async () => {
    const { service, state } = makeHarness();
    state.registrations.push({
      id: 'registration-existing',
      eventId: EVENT_ID,
      userId: null,
      firstName: 'Иван',
      lastName: 'Гостев',
      gender: 'M',
      birthYear: 1985,
      city: null,
      district: null,
      team: null,
      formatId: 1,
      startNumber: null,
      status: 'CONFIRMED',
      note: null,
      registeredAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      service.createGuest('admin-sub', EVENT_ID, {
        firstName: ' иван ',
        lastName: 'гостев',
        gender: 'M',
        birthYear: 1985,
        enrollments: [{ startId: START_A, formatId: 1 }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('applies the same enrollment rules to admin-for-user create', async () => {
    const { service, state } = makeHarness();

    const created = await service.createForParticipant('admin-sub', EVENT_ID, {
      userId: TARGET_USER_ID,
      enrollments: [
        { startId: START_A, formatId: 1 },
        { startId: START_B, formatId: 1 },
      ],
      startNumber: 12,
    });

    expect(created.enrollments).toHaveLength(2);
    expect(created.startNumber).toBe(12);
    expect(created.status).toBe('CONFIRMED');
    expect(state.enrollments).toHaveLength(2);
  });
});
