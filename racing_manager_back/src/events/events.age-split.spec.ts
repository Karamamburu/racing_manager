import { EventsService } from './events.service';
import { EventStatusSyncService } from './event-status-sync.service';
import { PrismaService } from '../prisma/prisma.service';
import { RolesService } from '../auth/roles.service';
import { UsersService } from '../users/users.service';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const START_ID = '22222222-2222-4222-8222-222222222222';
const FORMAT_ID = 1;

// 2026-11-10 falls in the season that ends in 2027.
const EVENT_DATE = new Date('2026-11-10T00:00:00.000Z');
const CONTROL_YEAR = 2027;

type Gender = 'M' | 'F';

type PersonSeed = {
  key: string;
  gender: Gender;
  birthYear: number;
  startNumber: number;
  timeMs: number | null;
  outcome?: 'FINISHED' | 'DNS' | 'DNF' | 'DSQ';
};

type StoredSectionSeed = {
  sectionId: string;
  sectionKind: 'BASE_GROUP' | 'PRESET';
  sortOrder: number;
};

type StoredSectionRow = StoredSectionSeed & {
  startId: string;
  formatId: number;
  gender: string;
};

type BracketSeed = {
  formatId: number | null;
  gender: string;
};

type HarnessOptions = {
  people?: PersonSeed[];
  starts?: 'one' | 'none';
  sections?: StoredSectionSeed[];
  bracketGender?: Gender;
};

const format = { id: FORMAT_ID, code: '10K', name: '10 км', sortOrder: 1 };

function startRow() {
  return {
    id: START_ID,
    purposeType: 'CUP_RACE',
    lapCount: 1,
    lapLengthMeters: 10000,
    displayName: null,
    routeColor: null,
    sortOrder: 0,
    legacyEffectiveDistanceM: null,
    formats: [{ format }],
  };
}

function person(seed: PersonSeed) {
  const outcome = seed.outcome ?? (seed.timeMs === null ? 'DNS' : 'FINISHED');

  return {
    id: `registration-${seed.key}`,
    userId: null,
    firstName: 'Участник',
    lastName: seed.key,
    gender: seed.gender,
    birthYear: seed.birthYear,
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
      timeMilliseconds: seed.timeMs,
      place: null,
      laps: [],
    },
    enrollments: [
      {
        id: `enrollment-${seed.key}`,
        startId: START_ID,
        formatId: FORMAT_ID,
        status: 'REGISTERED',
        start: startRow(),
        result: {
          outcome,
          timeMilliseconds: seed.timeMs,
          place: null,
        },
      },
    ],
  };
}

function sectionsFor(seeds: StoredSectionSeed[]): StoredSectionRow[] {
  return seeds.map((seed) => ({
    startId: START_ID,
    formatId: FORMAT_ID,
    gender: 'M',
    ...seed,
  }));
}

function makeHarness(options: HarnessOptions = {}) {
  const people = options.people ?? [];
  const starts = options.starts === 'none' ? [] : [startRow()];
  const sectionRows = sectionsFor(options.sections ?? []);
  const brackets: BracketSeed[] = options.bracketGender
    ? [{ formatId: FORMAT_ID, gender: options.bracketGender }]
    : [];

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
    status: 'PLANNED',
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
    laps: [{ id: 'lap-1', lapNumber: 1, distanceKm: { toString: () => '10' } }],
    starts,
    registrations: people.map(person),
    _count: { registrations: people.length },
  };

  const prisma = {
    event: { findUnique: jest.fn(() => Promise.resolve(event)) },
    categoryFinish: { findMany: jest.fn(() => Promise.resolve([])) },
    classCompetition: { findMany: jest.fn(() => Promise.resolve(brackets)) },
    ageSplitSection: { findMany: jest.fn(() => Promise.resolve(sectionRows)) },
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

  return { service, prisma };
}

function placeOf(
  rows: { id: string; place: number | null }[],
  key: string,
): number | null {
  const row = rows.find((candidate) => candidate.id === `registration-${key}`);
  if (!row) {
    throw new Error(`Missing protocol row ${key}`);
  }
  return row.place;
}

function sectionOf(
  rows: { id: string; sectionId: string }[],
  key: string,
): string {
  const row = rows.find((candidate) => candidate.id === `registration-${key}`);
  if (!row) {
    throw new Error(`Missing protocol row ${key}`);
  }
  return row.sectionId;
}

describe('EventsService.findById age splits', () => {
  it('returns today’s category places for an unsplit event', async () => {
    const { service } = makeHarness({
      people: [
        {
          key: 'slow',
          gender: 'M',
          birthYear: 1990,
          startNumber: 3,
          timeMs: 1_500_000,
        },
        {
          key: 'fast',
          gender: 'M',
          birthYear: 2001,
          startNumber: 1,
          timeMs: 1_400_000,
        },
        {
          key: 'dns',
          gender: 'M',
          birthYear: 1985,
          startNumber: 2,
          timeMs: null,
        },
        {
          key: 'woman',
          gender: 'F',
          birthYear: 1995,
          startNumber: 4,
          timeMs: 1_600_000,
        },
      ],
    });

    const event = await service.findById(EVENT_ID, { syncStatuses: false });
    const rows = event.registrations ?? [];

    expect(event.ageSplits).toHaveLength(2);
    expect(event.ageSplits?.[0]).toEqual({
      startId: START_ID,
      formatId: FORMAT_ID,
      gender: 'F',
      enabled: false,
      sections: [],
    });
    expect(
      event.ageSplits?.every(
        (split) => split.enabled === false && split.sections.length === 0,
      ),
    ).toBe(true);
    expect(rows.every((row) => row.sectionId === 'CATEGORY')).toBe(true);
    expect(placeOf(rows, 'fast')).toBe(1);
    expect(placeOf(rows, 'slow')).toBe(2);
    expect(placeOf(rows, 'dns')).toBeNull();
    expect(placeOf(rows, 'woman')).toBe(1);
  });

  it('numbers places from 1 inside the junior preset and the remainder', async () => {
    const { service } = makeHarness({
      people: [
        {
          key: 'junior',
          gender: 'M',
          birthYear: 2005,
          startNumber: 1,
          timeMs: 5_000_000,
        },
        {
          key: 'senior-slow',
          gender: 'M',
          birthYear: 1990,
          startNumber: 2,
          timeMs: 3_000_000,
        },
        {
          key: 'senior-fast',
          gender: 'M',
          birthYear: 1980,
          startNumber: 3,
          timeMs: 2_000_000,
        },
      ],
      sections: [
        {
          sectionId: 'PRESET_JUNIOR_UNDER_24',
          sectionKind: 'PRESET',
          sortOrder: 0,
        },
      ],
    });

    const event = await service.findById(EVENT_ID, { syncStatuses: false });
    const rows = event.registrations ?? [];

    expect(event.ageSplits).toHaveLength(1);
    expect(event.ageSplits?.[0]).toEqual({
      startId: START_ID,
      formatId: FORMAT_ID,
      gender: 'M',
      enabled: true,
      sections: [
        {
          id: 'PRESET_JUNIOR_UNDER_24',
          kind: 'PRESET',
          title: 'Юниоры и младше (<24)',
        },
      ],
    });
    expect(sectionOf(rows, 'junior')).toBe('PRESET_JUNIOR_UNDER_24');
    expect(sectionOf(rows, 'senior-slow')).toBe('REMAINDER');
    expect(sectionOf(rows, 'senior-fast')).toBe('REMAINDER');
    expect(placeOf(rows, 'junior')).toBe(1);
    expect(placeOf(rows, 'senior-fast')).toBe(1);
    expect(placeOf(rows, 'senior-slow')).toBe(2);
  });

  it('never places a future birth year into a base section', async () => {
    const { service } = makeHarness({
      people: [
        {
          key: 'future',
          gender: 'M',
          birthYear: CONTROL_YEAR + 3,
          startNumber: 1,
          timeMs: 1_000_000,
        },
        {
          key: 'child',
          gender: 'M',
          birthYear: CONTROL_YEAR - 12,
          startNumber: 2,
          timeMs: 1_100_000,
        },
      ],
      sections: [
        { sectionId: 'AGE_LE_14', sectionKind: 'BASE_GROUP', sortOrder: 0 },
      ],
    });

    const event = await service.findById(EVENT_ID, { syncStatuses: false });
    const rows = event.registrations ?? [];

    expect(sectionOf(rows, 'child')).toBe('AGE_LE_14');
    expect(sectionOf(rows, 'future')).toBe('NO_BIRTH_YEAR');
    expect(rows.filter((row) => row.sectionId === 'AGE_LE_14')).toHaveLength(1);
    expect(placeOf(rows, 'child')).toBe(1);
    expect(placeOf(rows, 'future')).toBe(1);
  });

  it('orders base sections by their stored order and ranks places per section', async () => {
    const { service } = makeHarness({
      people: [
        {
          key: 'master-3',
          gender: 'M',
          birthYear: CONTROL_YEAR - 67,
          startNumber: 2,
          timeMs: 2_000_000,
        },
        {
          key: 'master-2',
          gender: 'M',
          birthYear: CONTROL_YEAR - 57,
          startNumber: 1,
          timeMs: 1_000_000,
        },
      ],
      sections: [
        { sectionId: 'AGE_51_60', sectionKind: 'BASE_GROUP', sortOrder: 0 },
        { sectionId: 'AGE_61_PLUS', sectionKind: 'BASE_GROUP', sortOrder: 1 },
      ],
    });

    const event = await service.findById(EVENT_ID, { syncStatuses: false });
    const rows = event.registrations ?? [];
    const sections = event.ageSplits?.[0].sections ?? [];

    expect(sections.map((section) => section.id)).toEqual([
      'AGE_51_60',
      'AGE_61_PLUS',
    ]);
    expect(sections.map((section) => section.title)).toEqual([
      'Мастер 2 (51–60)',
      'Мастер 3 (61+)',
    ]);
    expect(rows.map((row) => row.sectionId)).toEqual([
      'AGE_51_60',
      'AGE_61_PLUS',
    ]);
    expect(placeOf(rows, 'master-2')).toBe(1);
    expect(placeOf(rows, 'master-3')).toBe(1);
  });

  it('keeps a class competition category whole while reporting the stored split', async () => {
    const { service } = makeHarness({
      bracketGender: 'M',
      people: [
        {
          key: 'young',
          gender: 'M',
          birthYear: CONTROL_YEAR - 12,
          startNumber: 1,
          timeMs: 2_000_000,
        },
        {
          key: 'adult',
          gender: 'M',
          birthYear: CONTROL_YEAR - 30,
          startNumber: 2,
          timeMs: 1_000_000,
        },
      ],
      sections: [
        { sectionId: 'AGE_LE_14', sectionKind: 'BASE_GROUP', sortOrder: 0 },
      ],
    });

    const event = await service.findById(EVENT_ID, { syncStatuses: false });
    const rows = event.registrations ?? [];

    expect(rows.every((row) => row.sectionId === 'CATEGORY')).toBe(true);
    expect(placeOf(rows, 'adult')).toBe(1);
    expect(placeOf(rows, 'young')).toBe(2);
    expect(event.ageSplits?.[0]).toEqual({
      startId: START_ID,
      formatId: FORMAT_ID,
      gender: 'M',
      enabled: true,
      sections: [
        {
          id: 'AGE_LE_14',
          kind: 'BASE_GROUP',
          title: 'Юноши младшего возраста (≤14)',
        },
      ],
    });
  });

  it('omits ageSplits for an event without starts', async () => {
    const { service } = makeHarness({ starts: 'none' });

    const event = await service.findById(EVENT_ID, { syncStatuses: false });

    expect(event.ageSplits).toBeUndefined();
    expect(event.registrations).toEqual([]);
  });

  it('keeps the existing event payload fields', async () => {
    const { service } = makeHarness({
      people: [
        {
          key: 'one',
          gender: 'M',
          birthYear: 1990,
          startNumber: 1,
          timeMs: 1_000_000,
        },
      ],
    });

    const event = await service.findById(EVENT_ID, { syncStatuses: false });

    expect(event.id).toBe(EVENT_ID);
    expect(event.name).toBe('Кубок');
    expect(event.registeredCount).toBe(1);
    expect(event.finishedCategories).toEqual([]);
    expect(event.starts.map((start) => start.id)).toEqual([START_ID]);
  });
});
