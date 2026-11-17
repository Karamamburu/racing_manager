import { ConflictException } from '@nestjs/common';
import { RolesService } from '../auth/roles.service';
import { PrismaService } from '../prisma/prisma.service';
import { TimingAttemptsReadService } from '../timing/timing-attempts-read.service';
import { CmsClient } from './cms.client';
import { ClassCompetitionsService } from './class-competitions.service';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const REGISTRATION_A = '22222222-2222-4222-8222-222222222222';
const REGISTRATION_B = '33333333-3333-4333-8333-333333333333';
const OTHER_EVENT_ID = '99999999-9999-4999-8999-999999999999';

const RUNNING_ATTEMPT_MESSAGE =
  'Нельзя создать многоэтапную гонку, пока участник её поля выступает в идущей попытке хронометража.';

type HarnessOptions = {
  registrations?: Array<{
    id: string;
    startNumber: number | null;
    birthYear?: number;
  }>;
  timingSessionParticipants?: Array<{
    registrationId: string;
    eventId?: string;
    status?: string;
  }>;
  protocolResults?: number;
};

function registrationRow(
  id: string,
  startNumber: number | null,
  birthYear = 1990,
) {
  return {
    id,
    firstName: 'Иван',
    lastName: 'Тестов',
    startNumber,
    gender: 'M',
    birthYear,
    formatId: null,
    status: 'REGISTERED',
  };
}

function makeHarness(options: HarnessOptions = {}) {
  const eventDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const registrationClose = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const state = {
    event: {
      id: EVENT_ID,
      name: 'Кубок',
      status: 'PLANNED',
      eventDate,
      registrationClose,
      eventFormats: [] as Array<{ formatId: number }>,
      starts: [] as Array<{
        id: string;
        sortOrder: number;
        formats: Array<{ formatId: number }>;
      }>,
    },
    registrations: (
      options.registrations ?? [
        { id: REGISTRATION_A, startNumber: 1 },
        { id: REGISTRATION_B, startNumber: 2 },
      ]
    ).map((row) =>
      registrationRow(row.id, row.startNumber, row.birthYear ?? 1990),
    ),
    timingSessionParticipants: (options.timingSessionParticipants ?? []).map(
      (row, index) => ({
        sessionId: `timing-session-${index + 1}`,
        eventId: row.eventId ?? EVENT_ID,
        registrationId: row.registrationId,
        status: row.status ?? 'RUNNING',
      }),
    ),
    protocolResults: options.protocolResults ?? 0,
  };

  const cmsCompetition = {
    id: 'cms-1',
    name: 'Кубок · Категория · M',
    status: 'DRAFT' as const,
    format: { stages: [] as Array<never> },
    participants: [] as Array<{ id: string; seed: number }>,
    stages: [] as Array<never>,
  };

  const prisma = {
    event: { findUnique: jest.fn(() => Promise.resolve(state.event)) },
    ageSplitCategory: { findMany: jest.fn(() => Promise.resolve([])) },
    ageSplitSection: { findMany: jest.fn(() => Promise.resolve([])) },
    classCompetition: {
      findMany: jest.fn(() => Promise.resolve([])),
      create: jest.fn(
        (args: {
          data: {
            capturedRegistrationIds: string[];
            capturedEnrollmentIds: string[];
            cmsCompetitionId: string;
            targetKey: string;
          };
        }) =>
          Promise.resolve({
            id: 'race-1',
            eventId: EVENT_ID,
            startId: null,
            formatId: null,
            gender: 'M',
            sectionId: 'CATEGORY',
            sectionKind: 'CATEGORY',
            targetGroupIds: [],
            targetWholeCategory: true,
            frozenTitle: 'Категория',
            frozenSubtitle: null,
            frozenYoungestBound: 0,
            frozenMemberBounds: [],
            frozenSectionNumber: null,
            heatTimes: [],
            event: {
              id: EVENT_ID,
              name: state.event.name,
              status: state.event.status,
              eventDate: state.event.eventDate,
              registrationClose: state.event.registrationClose,
            },
            ...args.data,
            status: 'DRAFT',
          }),
      ),
    },
    registration: {
      findMany: jest.fn(() => Promise.resolve(state.registrations)),
    },
    enrollment: { findMany: jest.fn(() => Promise.resolve([])) },
    result: {
      count: jest.fn(() => Promise.resolve(state.protocolResults)),
    },
    categoryFinish: { findFirst: jest.fn(() => Promise.resolve(null)) },
    timingSessionParticipant: {
      findFirst: jest.fn(
        (args: {
          where: {
            registrationId: { in: string[] };
            session: { eventId: string; status: string };
          };
        }) =>
          Promise.resolve(
            state.timingSessionParticipants.find(
              (row) =>
                args.where.registrationId.in.includes(row.registrationId) &&
                row.eventId === args.where.session.eventId &&
                row.status === args.where.session.status,
            ) ?? null,
          ),
      ),
    },
  };

  const roles = {
    assertHasAnyRole: jest.fn(() => Promise.resolve(undefined)),
  };

  const cms = {
    createCompetition: jest.fn(
      (body: { participants: Array<{ id: string; seed: number }> }) => {
        cmsCompetition.participants = body.participants;
        return Promise.resolve(cmsCompetition);
      },
    ),
    deleteCompetition: jest.fn(() => Promise.resolve(undefined)),
  };

  const timingAttempts = {
    hasRunningHeat: jest.fn(() => Promise.resolve(false)),
    hasRunningHeatForStage: jest.fn(() => Promise.resolve(false)),
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

  return { service, state, prisma, cms };
}

const CREATE_BODY = { gender: 'M', sectionId: 'CATEGORY' };

describe('ClassCompetitionsService create timing guard', () => {
  it('refuses creation when a participant of the field is in a running attempt', async () => {
    const { service, prisma, cms } = makeHarness({
      timingSessionParticipants: [
        { registrationId: REGISTRATION_B, status: 'RUNNING' },
      ],
    });

    const attempt = service.create('admin-sub', EVENT_ID, CREATE_BODY);

    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await expect(attempt).rejects.toThrow(RUNNING_ATTEMPT_MESSAGE);

    expect(cms.createCompetition).not.toHaveBeenCalled();
    expect(prisma.classCompetition.create).not.toHaveBeenCalled();
  });

  it('creates the race when the field excludes the running-attempt participant', async () => {
    const { service, prisma, cms } = makeHarness({
      registrations: [{ id: REGISTRATION_A, startNumber: 1 }],
      timingSessionParticipants: [
        { registrationId: REGISTRATION_B, status: 'RUNNING' },
      ],
    });

    const view = await service.create('admin-sub', EVENT_ID, CREATE_BODY);

    expect(view.id).toBe('race-1');
    expect(cms.createCompetition).toHaveBeenCalledTimes(1);
    expect(cms.createCompetition).toHaveBeenCalledWith({
      name: 'Кубок · Категория · M',
      participants: [{ id: REGISTRATION_A, seed: 1 }],
    });
    expect(prisma.classCompetition.create).toHaveBeenCalledTimes(1);
  });

  it('creates the race when the attempt belongs to another event', async () => {
    const { service, cms } = makeHarness({
      timingSessionParticipants: [
        {
          registrationId: REGISTRATION_A,
          eventId: OTHER_EVENT_ID,
          status: 'RUNNING',
        },
      ],
    });

    const view = await service.create('admin-sub', EVENT_ID, CREATE_BODY);

    expect(view.id).toBe('race-1');
    expect(cms.createCompetition).toHaveBeenCalledTimes(1);
  });

  it('creates the race after the attempt has closed', async () => {
    const { service, cms } = makeHarness({
      timingSessionParticipants: [
        { registrationId: REGISTRATION_A, status: 'COMPLETED' },
      ],
    });

    const view = await service.create('admin-sub', EVENT_ID, CREATE_BODY);

    expect(view.id).toBe('race-1');
    expect(cms.createCompetition).toHaveBeenCalledTimes(1);
  });

  it('creates before registration close when every active registration has a start number', async () => {
    const { service, state, cms } = makeHarness();
    state.event.registrationClose = new Date(Date.now() + 24 * 60 * 60 * 1000);
    state.event.eventDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);

    const view = await service.create('admin-sub', EVENT_ID, CREATE_BODY);

    expect(view.id).toBe('race-1');
    expect(cms.createCompetition).toHaveBeenCalledTimes(1);
  });

  it('refuses before registration close when an active registration has no number', async () => {
    const { service, state, cms } = makeHarness({
      registrations: [
        { id: REGISTRATION_A, startNumber: 1 },
        { id: REGISTRATION_B, startNumber: null },
      ],
    });
    state.event.registrationClose = new Date(Date.now() + 24 * 60 * 60 * 1000);
    state.event.eventDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);

    await expect(
      service.create('admin-sub', EVENT_ID, CREATE_BODY),
    ).rejects.toThrow(
      'Регистрация ещё не закрыта или не все стартовые номера выданы.',
    );
    expect(cms.createCompetition).not.toHaveBeenCalled();
  });

  it('keeps the existing protocol-result guard and creates nothing', async () => {
    const { service, prisma, cms } = makeHarness({ protocolResults: 1 });

    await expect(
      service.create('admin-sub', EVENT_ID, CREATE_BODY),
    ).rejects.toThrow(
      'В этой категории уже есть результаты в итоговом протоколе.',
    );
    expect(cms.createCompetition).not.toHaveBeenCalled();
    expect(prisma.classCompetition.create).not.toHaveBeenCalled();
  });
});
