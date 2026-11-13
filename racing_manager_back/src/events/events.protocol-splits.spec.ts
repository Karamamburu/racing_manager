import { EventsService } from './events.service';
import { EventStatusSyncService } from './event-status-sync.service';
import { PrismaService } from '../prisma/prisma.service';
import { RolesService } from '../auth/roles.service';
import { UsersService } from '../users/users.service';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const START_ID = '22222222-2222-4222-8222-222222222222';
const FORMAT_ID = 1;
const EVENT_DATE = new Date('2026-11-10T00:00:00.000Z');

type SplitSeed = {
  lapNumber: number;
  lapTimeMs: number;
  cumulativeMs: number;
};

type PersonSeed = {
  key: string;
  startNumber: number;
  splits: SplitSeed[];
};

const format = { id: FORMAT_ID, code: '10K', name: '10 км', sortOrder: 1 };

const TIMED_SPLITS: SplitSeed[] = [
  { lapNumber: 1, lapTimeMs: 300_000, cumulativeMs: 300_000 },
  { lapNumber: 2, lapTimeMs: 320_000, cumulativeMs: 620_000 },
];

function startRow() {
  return {
    id: START_ID,
    purposeType: 'CUP_RACE',
    lapCount: 2,
    lapLengthMeters: 5000,
    displayName: null,
    routeColor: null,
    sortOrder: 0,
    legacyEffectiveDistanceM: null,
    formats: [{ format }],
  };
}

function person(seed: PersonSeed) {
  const total = seed.splits.at(-1)?.cumulativeMs ?? null;

  return {
    id: `registration-${seed.key}`,
    userId: null,
    firstName: 'Участник',
    lastName: seed.key,
    gender: 'M',
    birthYear: 1990,
    city: null,
    district: null,
    team: null,
    formatId: FORMAT_ID,
    format,
    startNumber: seed.startNumber,
    status: 'REGISTERED',
    note: null,
    registeredAt: new Date('2026-11-01T00:00:00.000Z'),
    result: {
      timeMilliseconds: total,
      place: null,
      // Legacy registration-level laps keep their own shape and stay unread by
      // the protocol read; `EventParticipant.laps` is unchanged.
      laps: [{ timeMilliseconds: 300_000, eventLap: { lapNumber: 1 } }],
    },
    enrollments: [
      {
        id: `enrollment-${seed.key}`,
        startId: START_ID,
        formatId: FORMAT_ID,
        status: 'REGISTERED',
        start: startRow(),
        result: {
          outcome: total === null ? 'DNS' : 'FINISHED',
          timeMilliseconds: total,
          place: null,
          splits: seed.splits,
        },
      },
    ],
  };
}

type FindUniqueArgs = {
  where: { id: string };
  include: {
    registrations: {
      select: {
        enrollments: {
          select: {
            result: { select: Record<string, unknown> };
          };
        };
      };
    };
  };
};

function makeHarness(people: PersonSeed[]) {
  const event = {
    id: EVENT_ID,
    trackId: 'track-1',
    name: 'Кубок',
    eventType: 'RACE',
    sport: 'RUN',
    eventDate: EVENT_DATE,
    distanceKm: { toString: () => '10' },
    description: null,
    mapLink: null,
    registrationOpen: null,
    registrationClose: null,
    status: 'IN_PROGRESS',
    createdById: 'user-1',
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
    track: {
      id: 'track-1',
      name: 'Алёшкино',
      locationCity: null,
      mapLink: null,
    },
    createdBy: null,
    eventFormats: [{ format }],
    laps: [
      { id: 'lap-1', lapNumber: 1, distanceKm: { toString: () => '5' } },
      { id: 'lap-2', lapNumber: 2, distanceKm: { toString: () => '5' } },
    ],
    starts: [startRow()],
    registrations: people.map(person),
    _count: { registrations: people.length },
  };

  const seen: FindUniqueArgs[] = [];
  const prisma = {
    event: {
      findUnique: jest.fn((args: FindUniqueArgs) => {
        seen.push(args);
        return Promise.resolve(event);
      }),
    },
    categoryFinish: { findMany: jest.fn(() => Promise.resolve([])) },
    classCompetition: { findMany: jest.fn(() => Promise.resolve([])) },
    ageSplitSection: { findMany: jest.fn(() => Promise.resolve([])) },
    ageSplitCategory: { findMany: jest.fn(() => Promise.resolve([])) },
  };
  const roles = { assertAdminAccess: jest.fn(), assertHasAnyRole: jest.fn() };
  const users = { findBySub: jest.fn() };
  const sync = { syncDueStatuses: jest.fn(() => Promise.resolve(undefined)) };

  const service = new EventsService(
    prisma as unknown as PrismaService,
    roles as unknown as RolesService,
    users as unknown as UsersService,
    sync as unknown as EventStatusSyncService,
  );

  return { service, prisma, seen };
}

describe('EventsService.findById protocol splits', () => {
  it('maps published splits to lapSplits and leaves laps untouched', async () => {
    const { service } = makeHarness([
      { key: 'timed', startNumber: 1, splits: TIMED_SPLITS },
    ]);

    const event = await service.findById(EVENT_ID, { syncStatuses: false });
    const row = event.registrations?.[0];

    expect(row?.lapSplits).toEqual(TIMED_SPLITS);
    expect(row?.laps).toEqual([]);
    expect(row?.finishTimeMs).toBe(620_000);
    expect(row?.outcome).toBe('FINISHED');
  });

  it('leaves lapSplits absent for a result without splits', async () => {
    const { service } = makeHarness([
      { key: 'timed', startNumber: 1, splits: TIMED_SPLITS },
      { key: 'manual', startNumber: 2, splits: [] },
    ]);

    const event = await service.findById(EVENT_ID, { syncStatuses: false });
    const manual = event.registrations?.find(
      (row) => row.id === 'registration-manual',
    );

    expect(manual?.lapSplits).toBeUndefined();
    expect(manual?.laps).toEqual([]);
    expect(manual?.finishTimeMs).toBeNull();
    expect(manual?.outcome).toBe('DNS');
  });

  it('reads splits in lap order with a bounded select', async () => {
    const { service, seen } = makeHarness([
      { key: 'timed', startNumber: 1, splits: TIMED_SPLITS },
    ]);

    await service.findById(EVENT_ID, { syncStatuses: false });

    const select =
      seen[0].include.registrations.select.enrollments.select.result.select;
    expect(select).toEqual({
      outcome: true,
      timeMilliseconds: true,
      place: true,
      splits: {
        select: { lapNumber: true, lapTimeMs: true, cumulativeMs: true },
        orderBy: { lapNumber: 'asc' },
      },
    });
  });
});
