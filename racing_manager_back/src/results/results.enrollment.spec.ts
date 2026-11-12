import { GoneException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'http';
import request from 'supertest';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { RolesService } from '../auth/roles.service';
import { PrismaService } from '../prisma/prisma.service';
import { ResultsController } from './results.controller';
import { ResultsService } from './results.service';
import { parseUpsertResultBody } from './parse-upsert-result';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const ENROLLMENT_ID = '22222222-2222-4222-8222-222222222222';
const REGISTRATION_ID = '33333333-3333-4333-8333-333333333333';

type HarnessOptions = {
  enrollmentStatus?: string;
  startNumber?: number | null;
  hasExistingResult?: boolean;
  hasBracket?: boolean;
};

function makeHarness(options: HarnessOptions = {}) {
  const state = {
    written: false,
    executeRawCalls: [] as unknown[][],
  };
  const enrollment = {
    id: ENROLLMENT_ID,
    registrationId: REGISTRATION_ID,
    startId: '44444444-4444-4444-8444-444444444444',
    formatId: 1,
    status: options.enrollmentStatus ?? 'REGISTERED',
    registration: {
      id: REGISTRATION_ID,
      startNumber: options.startNumber === undefined ? 5 : options.startNumber,
      gender: 'M',
      status: 'CONFIRMED',
    },
  };

  const resultRow = {
    id: 'result-1',
    enrollmentId: ENROLLMENT_ID,
    registrationId: REGISTRATION_ID,
    recordedAt: new Date('2026-11-07T00:00:00.000Z'),
    updatedAt: new Date('2026-11-07T00:00:00.000Z'),
  };

  const tx = {
    $queryRaw: jest.fn(() => Promise.resolve([{ id: ENROLLMENT_ID }])),
    enrollment: {
      findFirst: jest.fn(() => Promise.resolve({ status: enrollment.status })),
    },
    result: {
      findUnique: jest.fn(() => {
        if (state.written) return Promise.resolve(resultRow);
        if (options.hasExistingResult) {
          return Promise.resolve({ id: 'result-1' });
        }
        return Promise.resolve(null);
      }),
      findFirst: jest.fn(() => Promise.resolve(null)),
    },
    $executeRaw: jest.fn(
      (strings: TemplateStringsArray, ...values: unknown[]) => {
        state.written = true;
        state.executeRawCalls.push([...strings, ...values]);
        return Promise.resolve(1);
      },
    ),
  };

  const prisma = {
    event: {
      findUnique: jest.fn(() =>
        Promise.resolve({
          id: EVENT_ID,
          status: 'IN_PROGRESS',
          eventDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        }),
      ),
    },
    enrollment: { findFirst: jest.fn(() => Promise.resolve(enrollment)) },
    classCompetition: {
      findMany: jest.fn(() =>
        Promise.resolve(
          options.hasBracket
            ? [
                {
                  id: 'bracket-1',
                  startId: enrollment.startId,
                  formatId: 1,
                  gender: 'M',
                  sectionId: 'CATEGORY_2',
                  sectionKind: 'CATEGORY_NUMBER',
                  targetKey: 'GROUPS:AGE_24_40',
                  targetGroupIds: ['AGE_24_40'],
                  targetWholeCategory: false,
                  frozenTitle: 'Категория 2',
                  frozenSubtitle: '24–40',
                  frozenYoungestBound: 24,
                  frozenMemberBounds: [24],
                  frozenSectionNumber: 2,
                  capturedEnrollmentIds: [ENROLLMENT_ID],
                  capturedRegistrationIds: [REGISTRATION_ID],
                },
              ]
            : [],
        ),
      ),
    },
    ageSplitCategory: { findMany: jest.fn(() => Promise.resolve([])) },
    ageSplitSection: { findMany: jest.fn(() => Promise.resolve([])) },
    categoryFinish: { findFirst: jest.fn(() => Promise.resolve(null)) },
    $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) =>
      work(tx),
    ),
  };

  const roles = {
    assertHasAnyRole: jest.fn(() => Promise.resolve(undefined)),
  };
  const service = new ResultsService(
    prisma as unknown as PrismaService,
    roles as unknown as RolesService,
  );

  return { service, state, prisma };
}

describe('parseUpsertResultBody', () => {
  it('requires a positive time for FINISHED', () => {
    expect(() => parseUpsertResultBody({ outcome: 'FINISHED' })).toThrow(
      'timeMilliseconds is required for FINISHED.',
    );
    expect(
      parseUpsertResultBody({
        outcome: 'FINISHED',
        timeMilliseconds: 3_600_000,
      }),
    ).toEqual({ outcome: 'FINISHED', timeMilliseconds: 3_600_000 });
  });

  it('enforces the 24h upper bound', () => {
    expect(() =>
      parseUpsertResultBody({
        outcome: 'FINISHED',
        timeMilliseconds: 24 * 60 * 60 * 1000 + 1,
      }),
    ).toThrow('at most 24 hours');
  });

  it('rejects timing on DNS/DNF/DSQ and returns null timing', () => {
    expect(() =>
      parseUpsertResultBody({ outcome: 'DNS', timeMilliseconds: 1 }),
    ).toThrow('must not be sent');
    expect(parseUpsertResultBody({ outcome: 'DNS' })).toEqual({
      outcome: 'DNS',
      timeMilliseconds: null,
    });
  });

  it('rejects laps arrays', () => {
    expect(() =>
      parseUpsertResultBody({
        outcome: 'FINISHED',
        laps: [{ lapNumber: 1, timeMilliseconds: 1000 }],
      }),
    ).toThrow('laps are not supported');
  });

  it('rejects a missing or unknown outcome', () => {
    expect(() => parseUpsertResultBody({})).toThrow('outcome must be');
    expect(() => parseUpsertResultBody({ outcome: 'OK' })).toThrow(
      'outcome must be',
    );
  });
});

describe('ResultsService enrollment upsert', () => {
  it('creates a FINISHED result for a REGISTERED enrollment', async () => {
    const { service, state } = makeHarness();

    const saved = await service.upsert('admin-sub', EVENT_ID, ENROLLMENT_ID, {
      outcome: 'FINISHED',
      timeMilliseconds: 3_600_000,
    });

    expect(saved).toMatchObject({
      enrollmentId: ENROLLMENT_ID,
      registrationId: REGISTRATION_ID,
      outcome: 'FINISHED',
      timeMilliseconds: 3_600_000,
    });
    expect(state.executeRawCalls).toHaveLength(1);
  });

  it('rejects a simple result for a row displayed in a race section', async () => {
    const { service, state } = makeHarness({ hasBracket: true });

    await expect(
      service.upsert('admin-sub', EVENT_ID, ENROLLMENT_ID, {
        outcome: 'FINISHED',
        timeMilliseconds: 3_600_000,
      }),
    ).rejects.toThrow('Это многоэтапная гонка');
    expect(state.executeRawCalls).toHaveLength(0);
  });

  it('updates the same result on correction and clears timing for DNS', async () => {
    const { service, state } = makeHarness({ hasExistingResult: true });

    const saved = await service.upsert('admin-sub', EVENT_ID, ENROLLMENT_ID, {
      outcome: 'DNS',
    });

    expect(saved).toMatchObject({ outcome: 'DNS', timeMilliseconds: null });
    expect(state.executeRawCalls[0].join('')).toContain('UPDATE results');
  });

  it('rejects a result for a WITHDRAWN enrollment without writing', async () => {
    const { service, state } = makeHarness({
      enrollmentStatus: 'WITHDRAWN',
    });

    await expect(
      service.upsert('admin-sub', EVENT_ID, ENROLLMENT_ID, {
        outcome: 'FINISHED',
        timeMilliseconds: 3_600_000,
      }),
    ).rejects.toThrow('Cannot record a result for a withdrawn enrollment.');
    expect(state.executeRawCalls).toHaveLength(0);
  });

  it('rejects invalid timing before touching the database', async () => {
    const { service, state, prisma } = makeHarness();

    await expect(
      service.upsert('admin-sub', EVENT_ID, ENROLLMENT_ID, {
        outcome: 'DNF',
        timeMilliseconds: 1000,
      }),
    ).rejects.toThrow('must not be sent');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(state.executeRawCalls).toHaveLength(0);
  });

  it('requires an assigned start number', async () => {
    const { service } = makeHarness({ startNumber: null });

    await expect(
      service.upsert('admin-sub', EVENT_ID, ENROLLMENT_ID, {
        outcome: 'FINISHED',
        timeMilliseconds: 3_600_000,
      }),
    ).rejects.toThrow('A start number must be assigned');
  });
});

describe('ResultsController routes', () => {
  let app: INestApplication;

  async function createApp() {
    const upsert = jest.fn(() =>
      Promise.resolve({
        id: 'result-1',
        enrollmentId: ENROLLMENT_ID,
        registrationId: REGISTRATION_ID,
        outcome: 'FINISHED',
        timeMilliseconds: 3_600_000,
        recordedAt: '2026-11-07T00:00:00.000Z',
        updatedAt: '2026-11-07T00:00:00.000Z',
      }),
    );
    const moduleRef = await Test.createTestingModule({
      controllers: [ResultsController],
      providers: [{ provide: ResultsService, useValue: { upsert } }],
    })
      .overrideGuard(SessionAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    app.use(
      (
        req: { session?: Record<string, unknown> },
        _res: unknown,
        next: () => void,
      ) => {
        req.session = { userSub: 'admin-sub' };
        next();
      },
    );
    await app.init();
    return { server: app.getHttpServer() as Server, upsert };
  }

  afterEach(async () => {
    await app?.close();
  });

  it('returns 410 for the retired registration-scoped route', async () => {
    const { server } = await createApp();

    const response = await request(server)
      .put(`/events/${EVENT_ID}/registrations/${REGISTRATION_ID}/result`)
      .send({ outcome: 'FINISHED', timeMilliseconds: 1000 });

    expect(response.status).toBe(410);
  });

  it('routes enrollment result writes to the enrollment id', async () => {
    const { server, upsert } = await createApp();

    const response = await request(server)
      .put(`/events/${EVENT_ID}/enrollments/${ENROLLMENT_ID}/result`)
      .send({ outcome: 'FINISHED', timeMilliseconds: 3_600_000 });

    expect(response.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      'admin-sub',
      EVENT_ID,
      ENROLLMENT_ID,
      expect.objectContaining({ outcome: 'FINISHED' }),
    );
  });

  it('keeps a direct GoneException for the retired handler', () => {
    const controller = new ResultsController({
      upsert: jest.fn(),
    } as unknown as ResultsService);

    expect(() => controller.retiredRegistrationResult()).toThrow(GoneException);
  });
});
