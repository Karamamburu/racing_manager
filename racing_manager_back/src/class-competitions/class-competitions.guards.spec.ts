import { ConflictException } from '@nestjs/common';
import { RolesService } from '../auth/roles.service';
import { PrismaService } from '../prisma/prisma.service';
import { TimingAttemptsReadService } from '../timing/timing-attempts-read.service';
import { CmsClient } from './cms.client';
import { CmsCompetition } from './cms.types';
import { ClassCompetitionsService } from './class-competitions.service';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const RACE_ID = '44444444-4444-4444-8444-444444444444';
const REGISTRATION_A = '22222222-2222-4222-8222-222222222222';
const REGISTRATION_B = '33333333-3333-4333-8333-333333333333';

const HEAT_MESSAGE =
  'Нельзя записать время заезда, пока идёт его попытка хронометража.';
const STAGE_MESSAGE =
  'Нельзя изменить этап, пока идёт попытка хронометража одного из его заездов.';

type RunningHeat = { stageId: string; heatNumber: number };

type StoredHeatTime = {
  stageId: string;
  heatNumber: number;
  registrationId: string;
  timeMilliseconds: number | null;
  status: string;
  qualificationStatus: string | null;
};

type HarnessOptions = {
  /** The heat attempts the read service reports as `RUNNING`. */
  runningHeats?: RunningHeat[];
  /** `SEEDED` offers heats; `PENDING` needs the mass-start auto-seed. */
  stageStatus?: 'PENDING' | 'SEEDED';
  /** Heat times already stored for the stage, as the commitment check reads them. */
  storedHeatTimes?: StoredHeatTime[];
};

/** One race: quarterfinal (two heats) → final. */
function competition(status: 'PENDING' | 'SEEDED'): CmsCompetition {
  return {
    id: 'cms-1',
    name: 'Кубок · Категория · M',
    status: 'IN_PROGRESS',
    participants: [
      { id: REGISTRATION_A, seed: 1 },
      { id: REGISTRATION_B, seed: 2 },
    ],
    format: {
      stages: [
        {
          id: 'qf',
          kind: 'QUARTERFINAL',
          label: '1/4 final',
          heats: {
            type: 'HEATS',
            heatCount: 2,
            heatSize: 6,
            remainder: 'BALANCED',
            seeding: { type: 'SNAKE' },
          },
          ranking: { type: 'BY_PLACE' },
          advancement: {
            type: 'ROUTES',
            routes: [
              {
                cut: { type: 'TOP_FRACTION', numerator: 1, denominator: 2 },
                toStageId: 'final',
              },
            ],
          },
        },
        {
          id: 'final',
          kind: 'FINAL',
          label: 'Final',
          heats: {
            type: 'HEATS',
            heatCount: 1,
            heatSize: 6,
            remainder: 'BALANCED',
            seeding: { type: 'BY_PLACE' },
          },
          ranking: { type: 'BY_PLACE' },
          advancement: { type: 'NONE' },
        },
      ],
    },
    stages: [
      {
        stageId: 'qf',
        status,
        entries:
          status === 'SEEDED'
            ? [
                { participantId: REGISTRATION_A, seed: 1, eliminated: false },
                { participantId: REGISTRATION_B, seed: 2, eliminated: false },
              ]
            : [],
        heats:
          status === 'SEEDED'
            ? [
                {
                  heatNumber: 1,
                  slots: [
                    {
                      position: 1,
                      participantId: REGISTRATION_A,
                      result: null,
                    },
                  ],
                },
                {
                  heatNumber: 2,
                  slots: [
                    {
                      position: 1,
                      participantId: REGISTRATION_B,
                      result: null,
                    },
                  ],
                },
              ]
            : [],
        ranking: [],
      },
      {
        stageId: 'final',
        status: 'PENDING',
        entries: [],
        heats: [],
        ranking: [],
      },
    ],
  };
}

function makeHarness(options: HarnessOptions = {}) {
  const runningHeats = options.runningHeats ?? [];
  const storedHeatTimes = options.storedHeatTimes ?? [];
  const state = {
    competition: competition(options.stageStatus ?? 'SEEDED'),
    row: {
      id: RACE_ID,
      eventId: EVENT_ID,
      startId: null,
      formatId: null,
      gender: 'M',
      sectionId: 'CATEGORY',
      sectionKind: 'CATEGORY',
      targetKey: 'CATEGORY',
      targetGroupIds: [] as string[],
      targetWholeCategory: true,
      frozenTitle: 'Категория',
      frozenSubtitle: null,
      frozenYoungestBound: 0,
      frozenMemberBounds: [] as number[],
      frozenSectionNumber: null,
      capturedEnrollmentIds: [] as string[],
      capturedRegistrationIds: [REGISTRATION_A, REGISTRATION_B],
      cmsCompetitionId: 'cms-1',
      status: 'DRAFT',
      event: {
        id: EVENT_ID,
        name: 'Кубок',
        status: 'PLANNED',
        eventDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        registrationClose: null,
      },
      heatTimes: [] as Array<Record<string, unknown>>,
    },
    registrations: [
      {
        id: REGISTRATION_A,
        firstName: 'Иван',
        lastName: 'Тестов',
        startNumber: 1,
        gender: 'M',
        birthYear: 1990,
        formatId: null,
        status: 'REGISTERED',
      },
      {
        id: REGISTRATION_B,
        firstName: 'Пётр',
        lastName: 'Второй',
        startNumber: 2,
        gender: 'M',
        birthYear: 1991,
        formatId: null,
        status: 'REGISTERED',
      },
    ],
  };

  const tx = {
    classHeatTime: {
      upsert: jest.fn(() => Promise.resolve({ id: 'heat-time-1' })),
      update: jest.fn(() => Promise.resolve({ id: 'heat-time-1' })),
      updateMany: jest.fn(() => Promise.resolve({ count: 0 })),
      deleteMany: jest.fn(() => Promise.resolve({ count: 0 })),
      create: jest.fn(() => Promise.resolve({ id: 'heat-time-1' })),
    },
    classHeatLapTime: {
      upsert: jest.fn(() => Promise.resolve({ id: 'heat-lap-1' })),
      deleteMany: jest.fn(() => Promise.resolve({ count: 0 })),
      findMany: jest.fn(() => Promise.resolve([])),
      createMany: jest.fn(() => Promise.resolve({ count: 0 })),
    },
    classCompetition: {
      update: jest.fn(() => Promise.resolve(state.row)),
    },
    result: {
      findUnique: jest.fn(() => Promise.resolve(null)),
      findFirst: jest.fn(() => Promise.resolve(null)),
      create: jest.fn(() => Promise.resolve({ id: 'result-1' })),
      update: jest.fn(() => Promise.resolve({ id: 'result-1' })),
    },
    registration: {
      update: jest.fn(() => Promise.resolve(state.registrations[0])),
      updateMany: jest.fn(() => Promise.resolve({ count: 0 })),
    },
  };

  const prisma = {
    $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) =>
      work(tx),
    ),
    event: { findUnique: jest.fn(() => Promise.resolve(null)) },
    classCompetition: {
      findFirst: jest.fn(() => Promise.resolve(state.row)),
      findUnique: jest.fn(() => Promise.resolve(state.row)),
      update: jest.fn(() => Promise.resolve(state.row)),
    },
    classHeatTime: {
      findMany: jest.fn(() => Promise.resolve(storedHeatTimes)),
      upsert: tx.classHeatTime.upsert,
      updateMany: tx.classHeatTime.updateMany,
      deleteMany: tx.classHeatTime.deleteMany,
    },
    registration: {
      findMany: jest.fn(() => Promise.resolve(state.registrations)),
    },
    eventLap: { findMany: jest.fn(() => Promise.resolve([])) },
  };

  const cms = {
    getCompetition: jest.fn(() => Promise.resolve(state.competition)),
    setStageField: jest.fn(() => Promise.resolve(undefined)),
    seedStage: jest.fn(() => Promise.resolve(state.competition)),
    reassignHeats: jest.fn(() => Promise.resolve(state.competition)),
    updatePlan: jest.fn(() => Promise.resolve(state.competition)),
    recordResults: jest.fn(() => Promise.resolve(undefined)),
    completeStage: jest.fn(() => Promise.resolve(state.competition)),
    createCompetition: jest.fn(),
    deleteCompetition: jest.fn(),
  };

  const roles = {
    assertHasAnyRole: jest.fn(() => Promise.resolve(undefined)),
  };

  const isRunning = (stageId: string, heatNumber?: number) =>
    runningHeats.some(
      (heat) =>
        heat.stageId === stageId &&
        (heatNumber == null || heat.heatNumber === heatNumber),
    );

  const timingAttempts = {
    hasRunningHeat: jest.fn(
      (_classCompetitionId: string, stageId: string, heatNumber: number) =>
        Promise.resolve(isRunning(stageId, heatNumber)),
    ),
    hasRunningHeatForStage: jest.fn(
      (_classCompetitionId: string, stageId: string) =>
        Promise.resolve(isRunning(stageId)),
    ),
    hasRunningAttemptForCategory: jest.fn(() => Promise.resolve(false)),
    hasRunningAttemptForRace: jest.fn(() => Promise.resolve(false)),
    hasRunningAttemptForParticipant: jest.fn(() => Promise.resolve(false)),
  };

  const service = new ClassCompetitionsService(
    prisma as unknown as PrismaService,
    roles as unknown as RolesService,
    cms as unknown as CmsClient,
    timingAttempts as unknown as TimingAttemptsReadService,
  );

  return { service, prisma, cms, roles, timingAttempts, state, tx };
}

const HEAT_A = {
  commit: false,
  entries: [
    {
      registrationId: REGISTRATION_A,
      heatNumber: 1,
      status: 'OK' as const,
      timeMilliseconds: 59000,
    },
  ],
};
const HEAT_B = {
  commit: false,
  entries: [
    {
      registrationId: REGISTRATION_B,
      heatNumber: 2,
      status: 'OK' as const,
      timeMilliseconds: 61000,
    },
  ],
};

describe('ClassCompetitionsService manual heat-time guard (F-15)', () => {
  it('refuses the whole request when a heat named in the body runs', async () => {
    const { service, cms, prisma, timingAttempts } = makeHarness({
      runningHeats: [{ stageId: 'qf', heatNumber: 2 }],
    });

    const attempt = service.recordHeatTimes(
      'admin-sub',
      EVENT_ID,
      RACE_ID,
      'qf',
      HEAT_B,
    );

    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await expect(attempt).rejects.toThrow(HEAT_MESSAGE);
    expect(timingAttempts.hasRunningHeat).toHaveBeenCalledWith(
      RACE_ID,
      'qf',
      2,
    );
    expect(cms.getCompetition).not.toHaveBeenCalled();
    expect(prisma.classHeatTime.upsert).not.toHaveBeenCalled();
  });

  it('keeps another heat of the same stage writable', async () => {
    const { service, tx, timingAttempts } = makeHarness({
      runningHeats: [{ stageId: 'qf', heatNumber: 2 }],
    });

    const view = await service.recordHeatTimes(
      'admin-sub',
      EVENT_ID,
      RACE_ID,
      'qf',
      HEAT_A,
    );

    expect(view.id).toBe(RACE_ID);
    expect(timingAttempts.hasRunningHeat).toHaveBeenCalledWith(
      RACE_ID,
      'qf',
      1,
    );
    expect(tx.classHeatTime.upsert).toHaveBeenCalledTimes(1);
  });

  it('refuses before the mass-start auto-seed of a pending stage', async () => {
    const { service, cms, prisma } = makeHarness({
      stageStatus: 'PENDING',
      runningHeats: [{ stageId: 'qf', heatNumber: 1 }],
    });

    await expect(
      service.recordHeatTimes('admin-sub', EVENT_ID, RACE_ID, 'qf', HEAT_A),
    ).rejects.toThrow(HEAT_MESSAGE);

    expect(cms.getCompetition).not.toHaveBeenCalled();
    expect(cms.setStageField).not.toHaveBeenCalled();
    expect(cms.seedStage).not.toHaveBeenCalled();
    expect(prisma.classHeatTime.upsert).not.toHaveBeenCalled();
  });

  it('writes the heat time when no heat of the stage runs', async () => {
    const { service, cms, tx } = makeHarness();

    const view = await service.recordHeatTimes(
      'admin-sub',
      EVENT_ID,
      RACE_ID,
      'qf',
      HEAT_A,
    );

    expect(view.id).toBe(RACE_ID);
    expect(cms.getCompetition).toHaveBeenCalledTimes(1);
    expect(tx.classHeatTime.upsert).toHaveBeenCalledTimes(1);
  });
});

describe('ClassCompetitionsService stage commit guard (F-16)', () => {
  it('refuses the commitment while any heat of the stage runs', async () => {
    const { service, cms, prisma } = makeHarness({
      runningHeats: [{ stageId: 'qf', heatNumber: 2 }],
    });

    const attempt = service.recordHeatTimes(
      'admin-sub',
      EVENT_ID,
      RACE_ID,
      'qf',
      {
        commit: true,
        entries: [
          {
            registrationId: REGISTRATION_A,
            heatNumber: 1,
            status: 'OK' as const,
            timeMilliseconds: 61000,
          },
        ],
      },
    );

    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await expect(attempt).rejects.toThrow(STAGE_MESSAGE);
    expect(cms.getCompetition).not.toHaveBeenCalled();
    expect(cms.recordResults).not.toHaveBeenCalled();
    expect(cms.completeStage).not.toHaveBeenCalled();
    expect(prisma.classHeatTime.upsert).not.toHaveBeenCalled();
  });

  it('commits the stage unchanged when no heat of the stage runs', async () => {
    const storedHeatTimes: StoredHeatTime[] = [
      {
        stageId: 'qf',
        heatNumber: 1,
        registrationId: REGISTRATION_A,
        timeMilliseconds: 59000,
        status: 'OK',
        qualificationStatus: null,
      },
      {
        stageId: 'qf',
        heatNumber: 2,
        registrationId: REGISTRATION_B,
        timeMilliseconds: 61000,
        status: 'OK',
        qualificationStatus: null,
      },
    ];
    const { service, cms, tx } = makeHarness({ storedHeatTimes });

    const view = await service.recordHeatTimes(
      'admin-sub',
      EVENT_ID,
      RACE_ID,
      'qf',
      {
        commit: true,
        entries: [
          {
            registrationId: REGISTRATION_A,
            heatNumber: 1,
            status: 'OK' as const,
            timeMilliseconds: 59000,
          },
          {
            registrationId: REGISTRATION_B,
            heatNumber: 2,
            status: 'OK' as const,
            timeMilliseconds: 61000,
          },
        ],
      },
    );

    expect(view.id).toBe(RACE_ID);
    expect(cms.recordResults).toHaveBeenCalledTimes(1);
    expect(cms.completeStage).toHaveBeenCalledWith('cms-1', 'qf');
    expect(tx.classHeatTime.upsert).toHaveBeenCalledTimes(2);
  });
});

describe('ClassCompetitionsService stage structure guards (F-16)', () => {
  it('refuses seeding (start-lists) while a heat of the stage runs', async () => {
    const { service, cms, prisma } = makeHarness({
      runningHeats: [{ stageId: 'qf', heatNumber: 1 }],
    });

    const attempt = service.seedStage('admin-sub', EVENT_ID, RACE_ID, 'qf');

    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await expect(attempt).rejects.toThrow(STAGE_MESSAGE);
    expect(cms.getCompetition).not.toHaveBeenCalled();
    expect(cms.setStageField).not.toHaveBeenCalled();
    expect(cms.seedStage).not.toHaveBeenCalled();
    expect(prisma.classHeatTime.updateMany).not.toHaveBeenCalled();
  });

  it('refuses heat reassignment while a heat of the stage runs', async () => {
    const { service, cms, prisma } = makeHarness({
      runningHeats: [{ stageId: 'qf', heatNumber: 2 }],
    });

    const attempt = service.reassignHeats(
      'admin-sub',
      EVENT_ID,
      RACE_ID,
      'qf',
      {
        heats: [{ heatNumber: 1, registrationIds: [REGISTRATION_A] }],
      },
    );

    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await expect(attempt).rejects.toThrow(STAGE_MESSAGE);
    expect(cms.reassignHeats).not.toHaveBeenCalled();
    expect(prisma.classHeatTime.deleteMany).not.toHaveBeenCalled();
  });

  it('refuses removing a stage whose heat runs', async () => {
    const { service, cms } = makeHarness({
      runningHeats: [{ stageId: 'final', heatNumber: 1 }],
    });

    const attempt = service.updatePlan('admin-sub', EVENT_ID, RACE_ID, {
      removeStageIds: ['final'],
    });

    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await expect(attempt).rejects.toThrow(STAGE_MESSAGE);
    expect(cms.getCompetition).not.toHaveBeenCalled();
    expect(cms.updatePlan).not.toHaveBeenCalled();
  });

  it('refuses a plan when one of several affected stages runs', async () => {
    const { service, cms } = makeHarness({
      runningHeats: [{ stageId: 'final', heatNumber: 1 }],
    });

    await expect(
      service.updatePlan('admin-sub', EVENT_ID, RACE_ID, {
        removeStageIds: ['qf', 'final'],
      }),
    ).rejects.toThrow(STAGE_MESSAGE);

    expect(cms.updatePlan).not.toHaveBeenCalled();
  });

  it('allows a plan that touches another stage', async () => {
    const { service, cms } = makeHarness({
      runningHeats: [{ stageId: 'final', heatNumber: 1 }],
    });

    const view = await service.updatePlan('admin-sub', EVENT_ID, RACE_ID, {
      removeStageIds: ['qf'],
    });

    expect(view.id).toBe(RACE_ID);
    expect(cms.updatePlan).toHaveBeenCalledWith('cms-1', {
      removeStageIds: ['qf'],
    });
  });

  it('allows adding a stage while another stage runs (F-16 lists removal)', async () => {
    const { service, cms } = makeHarness({
      runningHeats: [{ stageId: 'qf', heatNumber: 1 }],
    });

    const view = await service.updatePlan('admin-sub', EVENT_ID, RACE_ID, {
      addStage: 'PROLOGUE',
    });

    expect(view.id).toBe(RACE_ID);
    expect(cms.updatePlan).toHaveBeenCalledTimes(1);
  });
});

describe('ClassCompetitionsService guard access', () => {
  it('keeps the ORGANIZER/ADMIN check first for every guarded route', async () => {
    const { service, roles, cms } = makeHarness({
      runningHeats: [{ stageId: 'qf', heatNumber: 1 }],
    });

    await expect(
      service.recordHeatTimes('admin-sub', EVENT_ID, RACE_ID, 'qf', HEAT_A),
    ).rejects.toThrow(HEAT_MESSAGE);

    expect(roles.assertHasAnyRole).toHaveBeenCalledTimes(1);
    expect(cms.getCompetition).not.toHaveBeenCalled();
  });
});
