import { ConflictException } from '@nestjs/common';
import { RolesService } from '../auth/roles.service';
import { PrismaService } from '../prisma/prisma.service';
import { TimingAttemptsReadService } from '../timing/timing-attempts-read.service';
import { UsersService } from '../users/users.service';
import { EventStatusSyncService } from './event-status-sync.service';
import { EventsService, type EventDetails } from './events.service';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const START_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_START_ID = '33333333-3333-4333-8333-333333333333';
const FORMAT_ID = 1;
const OTHER_FORMAT_ID = 2;
const ENROLLMENT_ID = '55555555-5555-4555-8555-555555555555';
const REGISTRATION_ID = '66666666-6666-4666-8666-666666666666';

const RUNNING_CATEGORY_ATTEMPT_MESSAGE =
  'Нельзя завершить гонку, пока идёт попытка хронометража этой категории.';

const FINISH_BODY = { startId: START_ID, formatId: FORMAT_ID, gender: 'M' };

/**
 * One row of `timing_sessions` as the read guard sees it. A `DONE` row is a
 * closed attempt, so it never refuses the finish.
 */
type AttemptRow = {
  kind: 'CATEGORY' | 'HEAT';
  status: 'RUNNING' | 'DONE';
  eventId?: string;
  startId?: string;
  formatId?: number;
  gender?: 'M' | 'F';
};

const EVENT_ROW = {
  id: EVENT_ID,
  status: 'PLANNED',
  eventDate: new Date('2026-11-07T00:00:00.000Z'),
  starts: [
    {
      id: START_ID,
      formats: [{ formatId: FORMAT_ID }, { formatId: OTHER_FORMAT_ID }],
    },
  ],
};

const CATEGORY_ENROLLMENT = {
  id: ENROLLMENT_ID,
  startId: START_ID,
  formatId: FORMAT_ID,
  status: 'REGISTERED',
  registration: {
    id: REGISTRATION_ID,
    gender: 'M',
    birthYear: 1995,
    startNumber: 7,
    status: 'REGISTERED',
    registeredAt: new Date('2026-11-01T00:00:00.000Z'),
  },
  result: { outcome: 'FINISHED', timeMilliseconds: 600_000, place: null },
};

function makeHarness(attempts: AttemptRow[] = []) {
  const tx = {
    enrollment: {
      findMany: jest.fn(() => Promise.resolve([{ ...CATEGORY_ENROLLMENT }])),
    },
    result: { update: jest.fn(() => Promise.resolve({ id: 'result-1' })) },
    categoryFinish: {
      create: jest.fn(() => Promise.resolve({ id: 'finish-1' })),
    },
  };

  const prisma = {
    event: { findUnique: jest.fn(() => Promise.resolve(EVENT_ROW)) },
    categoryFinish: { findFirst: jest.fn(() => Promise.resolve(null)) },
    classCompetition: { findMany: jest.fn(() => Promise.resolve([])) },
    ageSplitSection: { findMany: jest.fn(() => Promise.resolve([])) },
    ageSplitCategory: { findMany: jest.fn(() => Promise.resolve([])) },
    $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) =>
      work(tx),
    ),
  };

  const roles = {
    assertAdminAccess: jest.fn(() => Promise.resolve(undefined)),
    assertHasAnyRole: jest.fn(() => Promise.resolve(undefined)),
  };
  const users = { findBySub: jest.fn(() => Promise.resolve({ id: 'user-1' })) };
  const sync = { syncDueStatuses: jest.fn(() => Promise.resolve(undefined)) };

  const timingAttempts = {
    hasRunningAttemptForCategory: jest.fn(
      (eventId: string, startId: string, formatId: number, gender: 'M' | 'F') =>
        Promise.resolve(
          attempts.some(
            (row) =>
              row.status === 'RUNNING' &&
              (row.eventId ?? EVENT_ID) === eventId &&
              (row.startId ?? START_ID) === startId &&
              (row.formatId ?? FORMAT_ID) === formatId &&
              (row.gender ?? 'M') === gender,
          ),
        ),
    ),
  };

  const service = new EventsService(
    prisma as unknown as PrismaService,
    roles as unknown as RolesService,
    users as unknown as UsersService,
    sync as unknown as EventStatusSyncService,
    timingAttempts as unknown as TimingAttemptsReadService,
  );
  const findById = jest
    .spyOn(service, 'findById')
    .mockResolvedValue({ id: EVENT_ID } as EventDetails);

  return { service, prisma, tx, roles, timingAttempts, findById };
}

describe('EventsService.finishCategory running-attempt guard (F-17)', () => {
  it('refuses the finish while a category attempt of the category runs', async () => {
    const { service, prisma, tx, roles, timingAttempts, findById } =
      makeHarness([{ kind: 'CATEGORY', status: 'RUNNING' }]);

    const attempt = service.finishCategory('admin-sub', EVENT_ID, FINISH_BODY);

    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await expect(attempt).rejects.toThrow(RUNNING_CATEGORY_ATTEMPT_MESSAGE);
    expect(roles.assertHasAnyRole).toHaveBeenCalled();
    expect(timingAttempts.hasRunningAttemptForCategory).toHaveBeenCalledWith(
      EVENT_ID,
      START_ID,
      FORMAT_ID,
      'M',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.enrollment.findMany).not.toHaveBeenCalled();
    expect(tx.result.update).not.toHaveBeenCalled();
    expect(tx.categoryFinish.create).not.toHaveBeenCalled();
    expect(findById).not.toHaveBeenCalled();
  });

  it('refuses the finish while a heat attempt of the category runs', async () => {
    const { service, prisma, tx, timingAttempts, findById } = makeHarness([
      { kind: 'HEAT', status: 'RUNNING' },
    ]);

    const attempt = service.finishCategory('admin-sub', EVENT_ID, FINISH_BODY);

    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await expect(attempt).rejects.toThrow(RUNNING_CATEGORY_ATTEMPT_MESSAGE);
    expect(timingAttempts.hasRunningAttemptForCategory).toHaveBeenCalledWith(
      EVENT_ID,
      START_ID,
      FORMAT_ID,
      'M',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.result.update).not.toHaveBeenCalled();
    expect(tx.categoryFinish.create).not.toHaveBeenCalled();
    expect(findById).not.toHaveBeenCalled();
  });

  it('finishes after the attempts of the category closed', async () => {
    const { service, prisma, tx, timingAttempts, findById } = makeHarness([
      { kind: 'CATEGORY', status: 'DONE' },
      { kind: 'HEAT', status: 'DONE' },
    ]);

    await service.finishCategory('admin-sub', EVENT_ID, FINISH_BODY);

    expect(timingAttempts.hasRunningAttemptForCategory).toHaveBeenCalledWith(
      EVENT_ID,
      START_ID,
      FORMAT_ID,
      'M',
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.result.update).toHaveBeenCalledWith({
      where: { enrollmentId: ENROLLMENT_ID },
      data: { place: 1 },
    });
    expect(tx.categoryFinish.create).toHaveBeenCalledWith({
      data: {
        eventId: EVENT_ID,
        startId: START_ID,
        formatId: FORMAT_ID,
        gender: 'M',
      },
    });
    expect(findById).toHaveBeenCalledWith(EVENT_ID, { syncStatuses: false });
  });

  it('finishes when no attempt of the category ever ran', async () => {
    const { service, tx, findById } = makeHarness();

    await service.finishCategory('admin-sub', EVENT_ID, FINISH_BODY);

    expect(tx.result.update).toHaveBeenCalledTimes(1);
    expect(tx.categoryFinish.create).toHaveBeenCalledTimes(1);
    expect(findById).toHaveBeenCalledWith(EVENT_ID, { syncStatuses: false });
  });

  it('keeps the start-aware category identity: another start does not block', async () => {
    const { service, tx, findById } = makeHarness([
      { kind: 'CATEGORY', status: 'RUNNING', startId: OTHER_START_ID },
    ]);

    await service.finishCategory('admin-sub', EVENT_ID, FINISH_BODY);

    expect(tx.categoryFinish.create).toHaveBeenCalledTimes(1);
    expect(findById).toHaveBeenCalledWith(EVENT_ID, { syncStatuses: false });
  });

  it('keeps the start-aware category identity: another format does not block', async () => {
    const { service, tx, findById } = makeHarness([
      { kind: 'HEAT', status: 'RUNNING', formatId: OTHER_FORMAT_ID },
    ]);

    await service.finishCategory('admin-sub', EVENT_ID, FINISH_BODY);

    expect(tx.categoryFinish.create).toHaveBeenCalledTimes(1);
    expect(findById).toHaveBeenCalledWith(EVENT_ID, { syncStatuses: false });
  });
});
