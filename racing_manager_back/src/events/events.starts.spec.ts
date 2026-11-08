import { BadRequestException, INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { EventStatusSyncService } from './event-status-sync.service';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { PrismaService } from '../prisma/prisma.service';
import { RolesService } from '../auth/roles.service';
import { UsersService } from '../users/users.service';

type FakeFormat = {
  id: number;
  sport: string;
  code: string;
  name: string;
  sortOrder: number;
};

type FakeEnrollment = { formatId: number };

type FakeStart = {
  id: string;
  eventId: string;
  purposeType: string;
  lapCount: number;
  lapLengthMeters: number;
  displayName: string | null;
  routeColor: string | null;
  sortOrder: number;
  legacyEffectiveDistanceM: number | null;
  formats: { format: FakeFormat }[];
  enrollments: FakeEnrollment[];
};

type FakeLap = { id: string; lapNumber: number; distanceKm: number };

type StartCreateData = {
  purposeType: string;
  lapCount: number;
  lapLengthMeters: number;
  displayName: string | null;
  routeColor?: string | null;
  sortOrder: number;
  legacyEffectiveDistanceM: number | null;
  formats?: { create?: { formatId: number }[] };
};

type EventCreateData = {
  trackId: string;
  name: string;
  eventType: string;
  sport: string;
  eventDate: Date;
  distanceKm: number;
  description: string | null;
  mapLink: string | null;
  registrationOpen: Date | null;
  registrationClose: Date | null;
  createdById: string;
  eventFormats?: { create?: { formatId: number }[] };
  laps?: { create?: { lapNumber: number; distanceKm: number }[] };
  starts?: { create?: StartCreateData[] };
};

type StartUpdateData = Partial<
  Pick<
    FakeStart,
    | 'purposeType'
    | 'lapCount'
    | 'lapLengthMeters'
    | 'displayName'
    | 'routeColor'
    | 'sortOrder'
    | 'legacyEffectiveDistanceM'
  >
>;

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const START_A = '22222222-2222-4222-8222-222222222222';
const START_B = '33333333-3333-4333-8333-333333333333';

const formats: FakeFormat[] = [
  { id: 1, sport: 'RUN', code: '5K', name: '5 км', sortOrder: 1 },
  { id: 2, sport: 'RUN', code: '10K', name: '10 км', sortOrder: 2 },
];

function formatById(id: number): FakeFormat {
  const format = formats.find((item) => item.id === id);
  if (!format) throw new Error(`Unknown format ${id}`);
  return format;
}

function buildStart(
  data: StartCreateData,
  id: string,
  eventId: string,
): FakeStart {
  return {
    id,
    eventId,
    purposeType: data.purposeType,
    lapCount: data.lapCount,
    lapLengthMeters: data.lapLengthMeters,
    displayName: data.displayName,
    routeColor: data.routeColor ?? null,
    sortOrder: data.sortOrder,
    legacyEffectiveDistanceM: data.legacyEffectiveDistanceM,
    formats: (data.formats?.create ?? []).map((row) => ({
      format: formatById(row.formatId),
    })),
    enrollments: [],
  };
}

function createResponse(data: EventCreateData) {
  const starts = (data.starts?.create ?? []).map((start, index) =>
    buildStart(start, `new-start-${index + 1}`, EVENT_ID),
  );
  const eventFormats = (data.eventFormats?.create ?? []).map((row) => ({
    format: formatById(row.formatId),
  }));
  const laps = (data.laps?.create ?? []).map((lap, index) => ({
    id: `lap-${index + 1}`,
    lapNumber: lap.lapNumber,
    distanceKm: lap.distanceKm,
  }));

  return {
    id: EVENT_ID,
    trackId: data.trackId,
    name: data.name,
    eventType: data.eventType,
    sport: data.sport,
    eventDate: data.eventDate,
    distanceKm: data.distanceKm,
    description: data.description,
    mapLink: data.mapLink,
    registrationOpen: data.registrationOpen,
    registrationClose: data.registrationClose,
    status: 'PLANNED',
    createdById: data.createdById,
    createdAt: new Date('2026-11-07T00:00:00.000Z'),
    updatedAt: new Date('2026-11-07T00:00:00.000Z'),
    eventFormats,
    laps,
    starts,
  };
}

function makeStart(overrides: Partial<FakeStart> = {}): FakeStart {
  return {
    id: START_A,
    eventId: EVENT_ID,
    purposeType: 'CUP_RACE',
    lapCount: 5,
    lapLengthMeters: 2000,
    displayName: null,
    routeColor: null,
    sortOrder: 0,
    legacyEffectiveDistanceM: null,
    formats: [{ format: formatById(1) }, { format: formatById(2) }],
    enrollments: [],
    ...overrides,
  };
}

function updateBody(starts: unknown[], extra: Record<string, unknown> = {}) {
  return {
    name: 'Кубок',
    sport: 'RUN',
    eventDate: '2026-11-07',
    starts,
    ...extra,
  };
}

function makeHarness() {
  const state: {
    event: {
      id: string;
      name: string;
      eventType: string;
      sport: string;
      eventDate: Date;
      distanceKm: number;
      description: string | null;
      mapLink: string | null;
      registrationOpen: Date | null;
      registrationClose: Date | null;
      status: string;
      createdById: string;
      createdAt: Date;
      updatedAt: Date;
    };
    starts: FakeStart[];
    eventFormats: { formatId: number }[];
    laps: FakeLap[];
    lockSql: string;
  } = {
    event: {
      id: EVENT_ID,
      name: 'Кубок',
      eventType: 'RACE',
      sport: 'RUN',
      eventDate: new Date('2026-11-07T00:00:00.000Z'),
      distanceKm: 10,
      description: null,
      mapLink: null,
      registrationOpen: null,
      registrationClose: null,
      status: 'PLANNED',
      createdById: 'user-1',
      createdAt: new Date('2026-11-07T00:00:00.000Z'),
      updatedAt: new Date('2026-11-07T00:00:00.000Z'),
    },
    starts: [],
    eventFormats: [{ formatId: 1 }],
    lockSql: '',
    laps: Array.from({ length: 5 }, (_, index) => ({
      id: `lap-${index + 1}`,
      lapNumber: index + 1,
      distanceKm: 2,
    })),
  };

  const details = () => ({
    ...state.event,
    track: {
      id: 'track-1',
      name: 'Алёшкино',
      locationCity: null,
      mapLink: null,
    },
    createdBy: null,
    eventFormats: state.eventFormats.map((row) => ({
      format: formatById(row.formatId),
    })),
    laps: state.laps.map((lap) => ({ ...lap })),
    starts: state.starts.map((start) => ({ ...start })),
    registrations: [],
    _count: { registrations: 0 },
  });

  const tx = {
    $queryRaw: jest.fn((strings: TemplateStringsArray) => {
      state.lockSql = strings.join('?');
      return Promise.resolve([{ id: EVENT_ID }]);
    }),
    start: {
      findMany: jest.fn(() =>
        Promise.resolve(
          state.starts.map((start) => ({
            ...start,
            formats: start.formats.map((row) => ({ format: row.format })),
            enrollments: start.enrollments.map((row) => ({
              formatId: row.formatId,
            })),
          })),
        ),
      ),
      update: jest.fn(
        (args: { where: { id: string }; data: StartUpdateData }) => {
          const start = state.starts.find((item) => item.id === args.where.id);
          if (!start) throw new Error('Missing start');
          Object.assign(start, args.data);
          return Promise.resolve(start);
        },
      ),
      create: jest.fn(
        (args: { data: StartCreateData & { eventId: string } }) => {
          const start = buildStart(
            args.data,
            `new-start-${state.starts.length + 1}`,
            args.data.eventId,
          );
          state.starts.push(start);
          return Promise.resolve(start);
        },
      ),
      deleteMany: jest.fn((args: { where: { id?: { in: string[] } } }) => {
        const ids = new Set(args.where.id?.in ?? []);
        state.starts = state.starts.filter((start) => !ids.has(start.id));
        return Promise.resolve({ count: ids.size });
      }),
    },
    startFormat: {
      deleteMany: jest.fn(
        (args: { where: { startId: string; formatId: { in: number[] } } }) => {
          const start = state.starts.find(
            (item) => item.id === args.where.startId,
          );
          if (start) {
            const ids = new Set(args.where.formatId.in);
            start.formats = start.formats.filter(
              (row) => !ids.has(row.format.id),
            );
          }
          return Promise.resolve({ count: 0 });
        },
      ),
      createMany: jest.fn(
        (args: { data: { startId: string; formatId: number }[] }) => {
          for (const row of args.data) {
            const start = state.starts.find((item) => item.id === row.startId);
            if (
              start &&
              !start.formats.some((f) => f.format.id === row.formatId)
            ) {
              start.formats.push({ format: formatById(row.formatId) });
            }
          }
          return Promise.resolve({ count: args.data.length });
        },
      ),
    },
    event: {
      update: jest.fn((args: { data: Record<string, unknown> }) => {
        Object.assign(state.event, args.data);
        return Promise.resolve(state.event);
      }),
    },
    eventFormat: {
      deleteMany: jest.fn((args: { where: { formatId: { in: number[] } } }) => {
        const ids = new Set(args.where.formatId.in);
        state.eventFormats = state.eventFormats.filter(
          (row) => !ids.has(row.formatId),
        );
        return Promise.resolve({ count: 0 });
      }),
      createMany: jest.fn((args: { data: { formatId: number }[] }) => {
        for (const row of args.data) {
          if (!state.eventFormats.some((f) => f.formatId === row.formatId)) {
            state.eventFormats.push({ formatId: row.formatId });
          }
        }
        return Promise.resolve({ count: args.data.length });
      }),
    },
    eventLap: {
      update: jest.fn(
        (args: {
          where: { eventId_lapNumber: { lapNumber: number } };
          data: { distanceKm: number };
        }) => {
          const lap = state.laps.find(
            (item) => item.lapNumber === args.where.eventId_lapNumber.lapNumber,
          );
          if (lap) lap.distanceKm = args.data.distanceKm;
          return Promise.resolve(lap);
        },
      ),
      deleteMany: jest.fn(() => {
        state.laps = [];
        return Promise.resolve({ count: 0 });
      }),
      createMany: jest.fn(
        (args: { data: { lapNumber: number; distanceKm: number }[] }) => {
          state.laps = args.data.map((lap, index) => ({
            id: `lap-${index + 1}`,
            lapNumber: lap.lapNumber,
            distanceKm: lap.distanceKm,
          }));
          return Promise.resolve({ count: args.data.length });
        },
      ),
    },
    registration: { findFirst: jest.fn(() => Promise.resolve(null)) },
    result: { count: jest.fn(() => Promise.resolve(0)) },
  };

  const prisma = {
    participationFormat: {
      findMany: jest.fn((args: { where?: { sport?: string } }) =>
        Promise.resolve(
          formats
            .filter(
              (format) =>
                !args.where?.sport || format.sport === args.where.sport,
            )
            .map((format) => ({ id: format.id })),
        ),
      ),
    },
    track: {
      findUnique: jest.fn(() => Promise.resolve({ id: 'track-1' })),
    },
    categoryFinish: {
      findMany: jest.fn(() => Promise.resolve([])),
    },
    event: {
      create: jest.fn((args: { data: EventCreateData }) =>
        Promise.resolve(createResponse(args.data)),
      ),
      findUnique: jest.fn((args: { select?: Record<string, unknown> }) => {
        if (args.select?.createdById) {
          return Promise.resolve({
            id: EVENT_ID,
            createdById: 'user-1',
            status: 'PLANNED',
          });
        }
        if (args.select?.sport) {
          return Promise.resolve({
            sport: state.event.sport,
            eventFormats: state.eventFormats,
            laps: state.laps.map((lap) => ({
              id: lap.id,
              lapNumber: lap.lapNumber,
            })),
          });
        }
        return Promise.resolve(details());
      }),
    },
    $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };

  const roles = {
    assertAdminAccess: jest.fn(() => Promise.resolve(undefined)),
    assertHasAnyRole: jest.fn(() => Promise.resolve(undefined)),
  };
  const users = {
    findBySub: jest.fn(() => Promise.resolve({ id: 'user-1' })),
  };
  const sync = {
    syncDueStatuses: jest.fn(() => Promise.resolve(undefined)),
  };

  const service = new EventsService(
    prisma as unknown as PrismaService,
    roles as unknown as RolesService,
    users as unknown as UsersService,
    sync as unknown as EventStatusSyncService,
  );

  return { service, state, prisma, tx };
}

describe('EventsService starts integration', () => {
  describe('create', () => {
    it('persists one start and projects event formats and laps', async () => {
      const { service, prisma } = makeHarness();

      const created = await service.create('sub', {
        name: 'Кубок',
        sport: 'RUN',
        eventDate: '2026-11-07',
        starts: [
          {
            purposeType: 'CUP_RACE',
            formatIds: [1, 2],
            lapCount: 5,
            lapLengthMeters: 2000,
            displayName: null,
            sortOrder: 0,
          },
        ],
      });

      expect(created.starts).toHaveLength(1);
      expect(created.starts[0]).toMatchObject({
        purposeType: 'CUP_RACE',
        formatIds: [1, 2],
        lapCount: 5,
        lapLengthMeters: 2000,
        resolvedLabel: 'Кубковая гонка — 10 км',
        displayedDistanceMeters: 10000,
        sortOrder: 0,
      });
      expect(created.formats.map((format) => format.id)).toEqual([1, 2]);
      expect(created.laps).toHaveLength(5);
      expect(created.distanceKm).toBe(10);
      expect(prisma.event.create).toHaveBeenCalledTimes(1);
    });

    it('persists and returns the route colour', async () => {
      const { service } = makeHarness();

      const created = await service.create('sub', {
        name: 'Кубок',
        sport: 'RUN',
        eventDate: '2026-11-07',
        starts: [
          {
            purposeType: 'CUP_RACE',
            formatIds: [1],
            lapCount: 1,
            lapLengthMeters: 1000,
            displayName: null,
            routeColor: 'ORANGE',
            sortOrder: 0,
          },
        ],
      });

      expect(created.starts[0].routeColor).toBe('ORANGE');
    });

    it('requires starts instead of synthesizing them', async () => {
      const { service } = makeHarness();

      await expect(
        service.create('sub', {
          name: 'Кубок',
          sport: 'RUN',
          eventDate: '2026-11-07',
          laps: [{ lapNumber: 1, distanceKm: 10 }],
          formatIds: [1],
        }),
      ).rejects.toThrow('starts is required.');
    });

    it('rejects client-fabricated start ids on create', async () => {
      const { service } = makeHarness();

      await expect(
        service.create('sub', {
          name: 'Кубок',
          sport: 'RUN',
          eventDate: '2026-11-07',
          starts: [
            {
              id: START_A,
              purposeType: 'CUP_RACE',
              formatIds: [1],
              lapCount: 1,
              lapLengthMeters: 1000,
              displayName: null,
              sortOrder: 0,
            },
          ],
        }),
      ).rejects.toThrow('starts[].id must be omitted on create.');
    });

    it('rejects fully identical starts', async () => {
      const { service } = makeHarness();

      await expect(
        service.create('sub', {
          name: 'Кубок',
          sport: 'RUN',
          eventDate: '2026-11-07',
          starts: [
            {
              purposeType: 'CUP_RACE',
              formatIds: [1],
              lapCount: 1,
              lapLengthMeters: 1000,
              displayName: null,
              sortOrder: 0,
            },
            {
              purposeType: 'CUP_RACE',
              formatIds: [1],
              lapCount: 1,
              lapLengthMeters: 1000,
              displayName: null,
              sortOrder: 1,
            },
          ],
        }),
      ).rejects.toThrow('Two starts must not be fully identical.');
    });

    it('rejects colliding auto-labels when configuration differs', async () => {
      const { service } = makeHarness();

      await expect(
        service.create('sub', {
          name: 'Кубок',
          sport: 'RUN',
          eventDate: '2026-11-07',
          starts: [
            {
              purposeType: 'CUP_RACE',
              formatIds: [1],
              lapCount: 1,
              lapLengthMeters: 1000,
              displayName: null,
              sortOrder: 0,
            },
            {
              purposeType: 'CUP_RACE',
              formatIds: [2],
              lapCount: 1,
              lapLengthMeters: 1000,
              displayName: null,
              sortOrder: 1,
            },
          ],
        }),
      ).rejects.toThrow('Start labels must be unique');
    });

    it('allows purpose-only differences with distinct auto-labels', async () => {
      const { service } = makeHarness();

      const created = await service.create('sub', {
        name: 'Кубок',
        sport: 'RUN',
        eventDate: '2026-11-07',
        starts: [
          {
            purposeType: 'CUP_RACE',
            formatIds: [1],
            lapCount: 1,
            lapLengthMeters: 1000,
            displayName: null,
            sortOrder: 0,
          },
          {
            purposeType: 'CONTROL_TRAINING',
            formatIds: [1],
            lapCount: 1,
            lapLengthMeters: 1000,
            displayName: null,
            sortOrder: 1,
          },
        ],
      });

      expect(created.starts.map((start) => start.resolvedLabel)).toEqual([
        'Кубковая гонка — 1 км',
        'Контрольная тренировка — 1 км',
      ]);
    });
  });

  describe('update with starts', () => {
    it('rejects omitting a start that has enrollments', async () => {
      const { service, state } = makeHarness();
      state.starts = [
        makeStart({
          id: START_A,
          sortOrder: 0,
          enrollments: [{ formatId: 1 }],
        }),
        makeStart({ id: START_B, sortOrder: 1 }),
      ];

      await expect(
        service.update(
          'sub',
          EVENT_ID,
          updateBody([
            {
              id: START_B,
              purposeType: 'CUP_RACE',
              formatIds: [1, 2],
              lapCount: 5,
              lapLengthMeters: 2000,
              displayName: null,
              sortOrder: 0,
            },
          ]),
        ),
      ).rejects.toThrow('Cannot remove a start that has enrollments.');
    });

    it('rejects changing laps on a start with enrollments', async () => {
      const { service, state } = makeHarness();
      state.starts = [
        makeStart({
          id: START_A,
          formats: [{ format: formatById(1) }],
          enrollments: [{ formatId: 1 }],
        }),
      ];

      await expect(
        service.update(
          'sub',
          EVENT_ID,
          updateBody([
            {
              id: START_A,
              purposeType: 'CUP_RACE',
              formatIds: [1],
              lapCount: 4,
              lapLengthMeters: 2000,
              displayName: null,
              sortOrder: 0,
            },
          ]),
        ),
      ).rejects.toThrow(
        'Cannot change purpose or lap setup of a start with enrollments.',
      );
    });

    it('updates the route colour on a start with enrollments', async () => {
      const { service, state } = makeHarness();
      state.starts = [
        makeStart({
          id: START_A,
          routeColor: 'BLUE',
          formats: [{ format: formatById(1) }],
          enrollments: [{ formatId: 1 }],
        }),
      ];

      const updated = await service.update(
        'sub',
        EVENT_ID,
        updateBody([
          {
            id: START_A,
            purposeType: 'CUP_RACE',
            formatIds: [1],
            lapCount: 5,
            lapLengthMeters: 2000,
            displayName: null,
            routeColor: 'YELLOW',
            sortOrder: 0,
          },
        ]),
      );

      expect(updated.starts[0].routeColor).toBe('YELLOW');
      expect(state.starts[0].routeColor).toBe('YELLOW');
    });

    it('casts the event row-lock parameter to uuid', async () => {
      const { service, state } = makeHarness();
      state.starts = [makeStart({ id: START_A, sortOrder: 0 })];

      await service.update(
        'sub',
        EVENT_ID,
        updateBody([
          {
            id: START_A,
            purposeType: 'CUP_RACE',
            formatIds: [1, 2],
            lapCount: 5,
            lapLengthMeters: 2000,
            displayName: null,
            sortOrder: 0,
          },
        ]),
      );

      expect(state.lockSql).toContain('WHERE id = ?::uuid FOR UPDATE');
    });

    it('rejects unknown start ids', async () => {
      const { service, state } = makeHarness();
      state.starts = [makeStart({ id: START_A })];

      await expect(
        service.update(
          'sub',
          EVENT_ID,
          updateBody([
            {
              id: START_B,
              purposeType: 'CUP_RACE',
              formatIds: [1, 2],
              lapCount: 5,
              lapLengthMeters: 2000,
              displayName: null,
              sortOrder: 0,
            },
          ]),
        ),
      ).rejects.toThrow(`Start ${START_B} does not belong to this event.`);
    });

    it('rejects colliding display names after normalization', async () => {
      const { service, state } = makeHarness();
      state.starts = [
        makeStart({ id: START_A, sortOrder: 0, displayName: 'Элита' }),
        makeStart({
          id: START_B,
          sortOrder: 1,
          displayName: '  элита ',
          formats: [{ format: formatById(1) }],
        }),
      ];

      await expect(
        service.update(
          'sub',
          EVENT_ID,
          updateBody([
            {
              id: START_A,
              purposeType: 'CUP_RACE',
              formatIds: [1, 2],
              lapCount: 5,
              lapLengthMeters: 2000,
              displayName: 'Элита',
              sortOrder: 0,
            },
            {
              id: START_B,
              purposeType: 'CUP_RACE',
              formatIds: [1],
              lapCount: 5,
              lapLengthMeters: 2000,
              displayName: '  элита ',
              sortOrder: 1,
            },
          ]),
        ),
      ).rejects.toThrow('Start labels must be unique');
    });

    it('adds a new start and returns the full desired set', async () => {
      const { service, state } = makeHarness();
      state.starts = [makeStart({ id: START_A, sortOrder: 0 })];

      const updated = await service.update(
        'sub',
        EVENT_ID,
        updateBody([
          {
            id: START_A,
            purposeType: 'CUP_RACE',
            formatIds: [1, 2],
            lapCount: 5,
            lapLengthMeters: 2000,
            displayName: null,
            sortOrder: 0,
          },
          {
            purposeType: 'CONTROL_TRAINING',
            formatIds: [1],
            lapCount: 2,
            lapLengthMeters: 1000,
            displayName: 'Разминка',
            sortOrder: 1,
          },
        ]),
      );

      expect(updated.starts).toHaveLength(2);
      expect(updated.starts.map((start) => start.resolvedLabel)).toEqual([
        'Кубковая гонка — 10 км',
        'Разминка',
      ]);
      expect(state.starts).toHaveLength(2);
      expect(state.starts[1].id).toMatch(/^new-start-/);
    });

    it('surfaces a bad request for an empty desired set', async () => {
      const { service } = makeHarness();

      await expect(
        service.update('sub', EVENT_ID, updateBody([])),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});

type StartsResponseBody = {
  starts?: {
    purposeType: string;
    formatIds: number[];
    resolvedLabel: string;
  }[];
  message?: string;
};

describe('EventsController starts HTTP contract', () => {
  let app: INestApplication;

  async function createApp(service = makeHarness().service) {
    const moduleRef = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [{ provide: EventsService, useValue: service }],
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
        req.session = { userSub: 'sub' };
        next();
      },
    );
    await app.init();
    return app.getHttpServer() as Server;
  }

  afterEach(async () => {
    await app?.close();
  });

  it('returns 201 and EventResponseDto.starts on create', async () => {
    const server = await createApp();

    const response = await request(server)
      .post('/admin/events')
      .send({
        name: 'Кубок',
        sport: 'RUN',
        eventDate: '2026-11-07',
        starts: [
          {
            purposeType: 'CUP_RACE',
            formatIds: [1, 2],
            lapCount: 5,
            lapLengthMeters: 2000,
            displayName: null,
            sortOrder: 0,
          },
        ],
      });

    const body = response.body as StartsResponseBody;
    expect(response.status).toBe(201);
    expect(body.starts).toHaveLength(1);
    expect(body.starts?.[0]).toMatchObject({
      purposeType: 'CUP_RACE',
      formatIds: [1, 2],
      resolvedLabel: 'Кубковая гонка — 10 км',
    });
  });

  it('returns 400 when create omits starts', async () => {
    const server = await createApp();

    const response = await request(server)
      .post('/admin/events')
      .send({
        name: 'Кубок',
        sport: 'RUN',
        eventDate: '2026-11-07',
        laps: [{ lapNumber: 1, distanceKm: 10 }],
        formatIds: [1],
      });

    const body = response.body as StartsResponseBody;
    expect(response.status).toBe(400);
    expect(body.message).toBe('starts is required.');
  });

  it('returns 400 when PATCH sends an empty desired set', async () => {
    const server = await createApp();

    const response = await request(server)
      .patch(`/admin/events/${EVENT_ID}`)
      .send(updateBody([]));

    expect(response.status).toBe(400);
  });

  it('returns 400 when PATCH omits an enrolled start', async () => {
    const { service, state } = makeHarness();
    state.starts = [
      makeStart({
        id: START_A,
        sortOrder: 0,
        enrollments: [{ formatId: 1 }],
      }),
      makeStart({ id: START_B, sortOrder: 1 }),
    ];
    const server = await createApp(service);

    const response = await request(server)
      .patch(`/admin/events/${EVENT_ID}`)
      .send(
        updateBody([
          {
            id: START_B,
            purposeType: 'CUP_RACE',
            formatIds: [1, 2],
            lapCount: 5,
            lapLengthMeters: 2000,
            displayName: null,
            sortOrder: 0,
          },
        ]),
      );

    const body = response.body as StartsResponseBody;
    expect(response.status).toBe(400);
    expect(body.message).toBe('Cannot remove a start that has enrollments.');
  });
});
