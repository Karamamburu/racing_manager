import { BadRequestException } from '@nestjs/common';
import { EventStatusSyncService } from '../events/event-status-sync.service';
import { RegistrationsService } from './registrations.service';
import { PrismaService } from '../prisma/prisma.service';
import { RolesService } from '../auth/roles.service';
import { UsersService } from '../users/users.service';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const START_A = '22222222-2222-4222-8222-222222222222';
const START_B = '33333333-3333-4333-8333-333333333333';

function makeHarness() {
  const state = {
    registrations: [] as { id: string; startNumber: number | null }[],
    enrollments: [] as {
      registrationId: string;
      startId: string;
      formatId: number;
      status: string;
    }[],
  };

  const prisma = {
    event: {
      findUnique: jest.fn(() =>
        Promise.resolve({
          id: EVENT_ID,
          status: 'PLANNED',
          eventDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          registrationOpen: null,
          registrationClose: null,
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
        }),
      ),
    },
    registration: {
      findMany: jest.fn(() => Promise.resolve([])),
      aggregate: jest.fn(() => Promise.resolve({ _max: { startNumber: 5 } })),
    },
    $transaction: jest.fn(
      (
        work: (tx: {
          registration: {
            create: (args: {
              data: { startNumber: number };
            }) => Promise<{ id: string }>;
          };
          enrollment: {
            create: (args: {
              data: {
                registrationId: string;
                startId: string;
                formatId: number;
                status: string;
              };
            }) => Promise<unknown>;
          };
        }) => Promise<unknown>,
      ) =>
        work({
          registration: {
            create: (args) => {
              const row = {
                id: `registration-${state.registrations.length + 1}`,
                startNumber: args.data.startNumber,
              };
              state.registrations.push(row);
              return Promise.resolve({ id: row.id });
            },
          },
          enrollment: {
            create: (args) => {
              state.enrollments.push(args.data);
              return Promise.resolve({});
            },
          },
        }),
    ),
  };

  const users = { findBySub: jest.fn(), findById: jest.fn() };
  const roles = {
    assertHasAnyRole: jest.fn(() => Promise.resolve(undefined)),
  };
  const sync = { syncDueStatuses: jest.fn(() => Promise.resolve(undefined)) };

  const service = new RegistrationsService(
    prisma as unknown as PrismaService,
    users as unknown as UsersService,
    roles as unknown as RolesService,
    sync as unknown as EventStatusSyncService,
  );

  return { service, state };
}

describe('RegistrationsService.seedTestRegistrations', () => {
  it('creates registrations enrolled in the selected start', async () => {
    const { service, state } = makeHarness();

    const result = await service.seedTestRegistrations('admin-sub', EVENT_ID, {
      count: 3,
      gender: 'M',
      startId: START_B,
      formatId: 1,
    });

    expect(result).toEqual({ created: 3 });
    expect(state.registrations).toHaveLength(3);
    expect(state.registrations.map((row) => row.startNumber)).toEqual([
      6, 7, 8,
    ]);
    expect(state.enrollments).toHaveLength(3);
    expect(state.enrollments[0]).toMatchObject({
      startId: START_B,
      formatId: 1,
      status: 'REGISTERED',
    });
  });

  it('rejects a start that does not belong to the event', async () => {
    const { service, state } = makeHarness();

    await expect(
      service.seedTestRegistrations('admin-sub', EVENT_ID, {
        count: 1,
        gender: 'M',
        startId: '99999999-9999-4999-8999-999999999999',
        formatId: 1,
      }),
    ).rejects.toThrow('startId does not belong to this event.');
    expect(state.registrations).toHaveLength(0);
  });

  it('rejects a format that is not enabled on the start', async () => {
    const { service, state } = makeHarness();

    await expect(
      service.seedTestRegistrations('admin-sub', EVENT_ID, {
        count: 1,
        gender: 'M',
        startId: START_B,
        formatId: 2,
      }),
    ).rejects.toThrow('formatId is not enabled on the selected start.');
    expect(state.registrations).toHaveLength(0);
  });

  it('requires a start id', async () => {
    const { service } = makeHarness();

    await expect(
      service.seedTestRegistrations('admin-sub', EVENT_ID, {
        count: 1,
        gender: 'M',
        formatId: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
