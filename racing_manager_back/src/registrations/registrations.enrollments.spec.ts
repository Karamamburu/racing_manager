import { BadRequestException } from '@nestjs/common';
import { EventStatusSyncService } from '../events/event-status-sync.service';
import { RegistrationsService } from './registrations.service';
import { PrismaService } from '../prisma/prisma.service';
import { RolesService } from '../auth/roles.service';
import { UsersService } from '../users/users.service';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const REGISTRATION_ID = '22222222-2222-4222-8222-222222222222';
const START_A = '33333333-3333-4333-8333-333333333333';
const START_B = '44444444-4444-4444-8444-444444444444';

type FakeEnrollmentRow = {
  id: string;
  eventId: string;
  registrationId: string;
  startId: string;
  formatId: number;
  status: string;
  result: { id: string } | null;
  createdAt: Date;
};

type HarnessOptions = {
  enrollments?: {
    startId: string;
    formatId: number;
    status?: string;
    hasResult?: boolean;
  }[];
  registrationStatus?: string;
  hasResult?: boolean;
};

function makeHarness(options: HarnessOptions = {}) {
  const state = {
    event: {
      id: EVENT_ID,
      status: 'PLANNED',
      eventDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
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
    registration: {
      id: REGISTRATION_ID,
      eventId: EVENT_ID,
      userId: 'user-1',
      firstName: 'Анна',
      lastName: 'Тестова',
      gender: 'F',
      birthYear: 1990,
      city: null,
      district: null,
      team: null,
      formatId: 1,
      startNumber: null as number | null,
      status: options.registrationStatus ?? 'REGISTERED',
      note: null,
      registeredAt: new Date(),
      updatedAt: new Date(),
    },
    enrollments: (options.enrollments ?? []).map((row, index) => ({
      id: `enrollment-${index + 1}`,
      eventId: EVENT_ID,
      registrationId: REGISTRATION_ID,
      startId: row.startId,
      formatId: row.formatId,
      status: row.status ?? 'REGISTERED',
      result: row.hasResult ? { id: `result-${index + 1}` } : null,
      createdAt: new Date(Date.now() + index),
    })) as FakeEnrollmentRow[],
    hasResult: options.hasResult ?? false,
  };

  const tx = {
    $queryRaw: jest.fn(() => Promise.resolve([{ id: REGISTRATION_ID }])),
    registration: {
      findFirst: jest.fn(() => Promise.resolve(state.registration)),
      update: jest.fn(
        (args: {
          where: { id: string };
          data: Partial<typeof state.registration>;
        }) => {
          Object.assign(state.registration, args.data);
          return Promise.resolve(state.registration);
        },
      ),
    },
    enrollment: {
      findMany: jest.fn(
        (args: {
          where: { registrationId: string };
          orderBy?: { createdAt: string };
        }) =>
          Promise.resolve(
            state.enrollments
              .filter((row) => row.registrationId === args.where.registrationId)
              .sort(
                (left, right) =>
                  left.createdAt.getTime() - right.createdAt.getTime(),
              ),
          ),
      ),
      update: jest.fn(
        (args: {
          where: { id: string };
          data: { status?: string; formatId?: number };
        }) => {
          const row = state.enrollments.find(
            (item) => item.id === args.where.id,
          );
          if (!row) throw new Error('Missing enrollment');
          Object.assign(row, args.data);
          return Promise.resolve(row);
        },
      ),
      updateMany: jest.fn(
        (args: {
          where: { registrationId: string };
          data: { status: string };
        }) => {
          let count = 0;
          for (const row of state.enrollments) {
            if (row.registrationId === args.where.registrationId) {
              row.status = args.data.status;
              count += 1;
            }
          }
          return Promise.resolve({ count });
        },
      ),
      create: jest.fn(
        (args: {
          data: {
            eventId: string;
            registrationId: string;
            startId: string;
            formatId: number;
            status: string;
          };
        }) => {
          const row: FakeEnrollmentRow = {
            ...args.data,
            id: `enrollment-${state.enrollments.length + 1}`,
            result: null,
            createdAt: new Date(Date.now() + state.enrollments.length),
          };
          state.enrollments.push(row);
          return Promise.resolve(row);
        },
      ),
    },
    result: {
      findFirst: jest.fn(() =>
        Promise.resolve(state.hasResult ? { id: 'result-1' } : null),
      ),
    },
  };

  const prisma = {
    event: { findUnique: jest.fn(() => Promise.resolve(state.event)) },
    registration: tx.registration,
    enrollment: tx.enrollment,
    result: tx.result,
    classCompetition: {
      findFirst: jest.fn(() => Promise.resolve(null)),
    },
    $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) =>
      work(tx),
    ),
  };

  const users = {
    findBySub: jest.fn(() =>
      Promise.resolve({
        id: 'actor-1',
        firstName: 'Анна',
        lastName: 'Тестова',
        gender: 'F',
        birthDate: '1990-05-01',
      }),
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

function desired(startId: string, formatId: number) {
  return { startId, formatId };
}

describe('RegistrationsService PATCH enrollments', () => {
  it('keeps enrollments unchanged when omitted and updates startNumber', async () => {
    const { service, state } = makeHarness({
      enrollments: [{ startId: START_A, formatId: 1 }],
    });

    const updated = await service.update(
      'admin-sub',
      EVENT_ID,
      REGISTRATION_ID,
      {
        startNumber: 7,
      },
    );

    expect(updated.startNumber).toBe(7);
    expect(updated.status).toBe('CONFIRMED');
    expect(state.enrollments).toHaveLength(1);
    expect(state.enrollments[0]).toMatchObject({
      startId: START_A,
      formatId: 1,
      status: 'REGISTERED',
    });
  });

  it('rejects an empty desired set', async () => {
    const { service, state } = makeHarness({
      enrollments: [{ startId: START_A, formatId: 1 }],
    });

    await expect(
      service.update('admin-sub', EVENT_ID, REGISTRATION_ID, {
        enrollments: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(state.enrollments[0].status).toBe('REGISTERED');
  });

  it('withdraws an omitted Result-free enrollment and keeps the listed one', async () => {
    const { service, state } = makeHarness({
      enrollments: [
        { startId: START_A, formatId: 1 },
        { startId: START_B, formatId: 1 },
      ],
    });

    await service.update('admin-sub', EVENT_ID, REGISTRATION_ID, {
      enrollments: [desired(START_A, 1)],
    });

    const byStart = new Map(state.enrollments.map((row) => [row.startId, row]));
    expect(byStart.get(START_A)?.status).toBe('REGISTERED');
    expect(byStart.get(START_B)?.status).toBe('WITHDRAWN');
    expect(state.enrollments).toHaveLength(2);
  });

  it('allows changing a Result-free enrollment while listing a Result enrollment unchanged', async () => {
    const { service, state } = makeHarness({
      enrollments: [
        { startId: START_A, formatId: 1, hasResult: true },
        { startId: START_B, formatId: 1 },
      ],
    });

    await service.update('admin-sub', EVENT_ID, REGISTRATION_ID, {
      enrollments: [desired(START_A, 1), desired(START_B, 1)],
    });

    const byStart = new Map(state.enrollments.map((row) => [row.startId, row]));
    expect(byStart.get(START_A)).toMatchObject({
      status: 'REGISTERED',
      formatId: 1,
    });
    expect(byStart.get(START_B)?.status).toBe('REGISTERED');
  });

  it('rejects changing format on a Result enrollment', async () => {
    const { service } = makeHarness({
      enrollments: [{ startId: START_A, formatId: 1, hasResult: true }],
    });

    await expect(
      service.update('admin-sub', EVENT_ID, REGISTRATION_ID, {
        enrollments: [desired(START_A, 2)],
      }),
    ).rejects.toThrow(
      'Cannot change format on an enrollment that has a result.',
    );
  });

  it('rejects withdrawing a Result enrollment', async () => {
    const { service, state } = makeHarness({
      enrollments: [
        { startId: START_A, formatId: 1, hasResult: true },
        { startId: START_B, formatId: 1 },
      ],
    });

    await expect(
      service.update('admin-sub', EVENT_ID, REGISTRATION_ID, {
        enrollments: [desired(START_B, 1)],
      }),
    ).rejects.toThrow('Cannot withdraw an enrollment that has a result.');
    expect(state.enrollments[0].status).toBe('REGISTERED');
  });

  it('leaves an omitted WITHDRAWN+Result anomaly untouched', async () => {
    const { service, state } = makeHarness({
      enrollments: [
        { startId: START_A, formatId: 1 },
        {
          startId: START_B,
          formatId: 1,
          status: 'WITHDRAWN',
          hasResult: true,
        },
      ],
    });

    await service.update('admin-sub', EVENT_ID, REGISTRATION_ID, {
      enrollments: [desired(START_A, 1)],
    });

    const byStart = new Map(state.enrollments.map((row) => [row.startId, row]));
    expect(byStart.get(START_A)?.status).toBe('REGISTERED');
    expect(byStart.get(START_B)?.status).toBe('WITHDRAWN');
  });

  it('rejects reactivating a WITHDRAWN enrollment that has a result', async () => {
    const { service } = makeHarness({
      enrollments: [
        {
          startId: START_A,
          formatId: 1,
          status: 'WITHDRAWN',
          hasResult: true,
        },
        { startId: START_B, formatId: 1 },
      ],
    });

    await expect(
      service.update('admin-sub', EVENT_ID, REGISTRATION_ID, {
        enrollments: [desired(START_A, 1), desired(START_B, 1)],
      }),
    ).rejects.toThrow('Cannot reactivate an enrollment that has a result.');
  });

  it('reactivates the same withdrawn row instead of creating a duplicate', async () => {
    const { service, state } = makeHarness({
      enrollments: [
        { startId: START_A, formatId: 1, status: 'WITHDRAWN' },
        { startId: START_B, formatId: 1 },
      ],
    });

    await service.update('admin-sub', EVENT_ID, REGISTRATION_ID, {
      enrollments: [desired(START_A, 1), desired(START_B, 1)],
    });

    expect(state.enrollments).toHaveLength(2);
    expect(
      state.enrollments.find((row) => row.startId === START_A)?.status,
    ).toBe('REGISTERED');
  });

  it('creates an enrollment for a newly added start', async () => {
    const { service, state } = makeHarness({
      enrollments: [{ startId: START_A, formatId: 1 }],
    });

    await service.update('admin-sub', EVENT_ID, REGISTRATION_ID, {
      enrollments: [desired(START_A, 1), desired(START_B, 1)],
    });

    expect(state.enrollments).toHaveLength(2);
    expect(
      state.enrollments.find((row) => row.startId === START_B),
    ).toMatchObject({ status: 'REGISTERED', formatId: 1 });
  });

  it('returns the enrollment response set', async () => {
    const { service } = makeHarness({
      enrollments: [
        { startId: START_A, formatId: 1 },
        { startId: START_B, formatId: 1 },
      ],
    });

    const updated = await service.update(
      'admin-sub',
      EVENT_ID,
      REGISTRATION_ID,
      {
        enrollments: [desired(START_A, 2), desired(START_B, 1)],
      },
    );

    expect(updated.enrollments).toEqual([
      expect.objectContaining({
        startId: START_A,
        formatId: 2,
        isCupEligible: true,
      }),
      expect.objectContaining({
        startId: START_B,
        formatId: 1,
        isCupEligible: false,
      }),
    ]);
  });
});

describe('RegistrationsService whole cancel with results', () => {
  it('withdraws the registration and enrollments when no result exists', async () => {
    const { service, state } = makeHarness({
      enrollments: [
        { startId: START_A, formatId: 1 },
        { startId: START_B, formatId: 1 },
      ],
    });

    await service.cancelOwn('sub', EVENT_ID);

    expect(state.registration.status).toBe('WITHDRAWN');
    expect(state.enrollments.map((row) => row.status)).toEqual([
      'WITHDRAWN',
      'WITHDRAWN',
    ]);
    expect(state.enrollments).toHaveLength(2);
  });

  it('rejects whole cancel when any result exists and keeps rows intact', async () => {
    const { service, state } = makeHarness({
      enrollments: [{ startId: START_A, formatId: 1, hasResult: true }],
      hasResult: true,
    });

    await expect(service.cancelOwn('sub', EVENT_ID)).rejects.toThrow(
      'Cannot cancel a registration that has results.',
    );
    expect(state.registration.status).toBe('REGISTERED');
    expect(state.enrollments[0].status).toBe('REGISTERED');
  });
});
