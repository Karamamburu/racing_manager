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
  /** Stored `Result.place` snapshot, pinned so a read must never rewrite it. */
  storedPlace?: number | null;
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

type CategorySeed = {
  categoryNumber: number;
  groupId: string;
};

type CategoryRow = CategorySeed & {
  startId: string;
  formatId: number;
  gender: string;
};

type BracketSeed = {
  formatId: number | null;
  gender: string;
};

type FinishedCategorySeed = {
  startId: string;
  formatId: number;
  gender: string;
};

type HarnessOptions = {
  people?: PersonSeed[];
  starts?: 'one' | 'none';
  sections?: StoredSectionSeed[];
  categories?: CategorySeed[];
  bracketGender?: Gender;
  finishedCategories?: FinishedCategorySeed[];
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
      place: seed.storedPlace ?? null,
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
          place: seed.storedPlace ?? null,
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

function categoriesFor(seeds: CategorySeed[]): CategoryRow[] {
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
  const categoryRows = categoriesFor(options.categories ?? []);
  const brackets: BracketSeed[] = options.bracketGender
    ? [{ formatId: FORMAT_ID, gender: options.bracketGender }]
    : [];
  const finishedCategories: FinishedCategorySeed[] =
    options.finishedCategories ?? [];

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
    categoryFinish: {
      findMany: jest.fn(() => Promise.resolve(finishedCategories)),
    },
    classCompetition: { findMany: jest.fn(() => Promise.resolve(brackets)) },
    ageSplitSection: { findMany: jest.fn(() => Promise.resolve(sectionRows)) },
    ageSplitCategory: {
      findMany: jest.fn(() => Promise.resolve(categoryRows)),
    },
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

  return { service, prisma, event };
}

type ProtocolRowLike = {
  id: string;
  place: number | null;
  sectionId: string;
  finishTimeMs?: number | null;
  outcome?: string | null;
};

function rowOf(rows: ProtocolRowLike[], key: string): ProtocolRowLike {
  const row = rows.find((candidate) => candidate.id === `registration-${key}`);
  if (!row) {
    throw new Error(`Missing protocol row ${key}`);
  }
  return row;
}

function placeOf(rows: ProtocolRowLike[], key: string): number | null {
  return rowOf(rows, key).place;
}

function sectionOf(rows: ProtocolRowLike[], key: string): string {
  return rowOf(rows, key).sectionId;
}

describe('EventsService.findById age categories', () => {
  it('keeps an unsplit category disabled with CATEGORY on every row', async () => {
    const { service } = makeHarness({
      people: [
        {
          key: 'slow',
          gender: 'M',
          birthYear: CONTROL_YEAR - 37,
          startNumber: 3,
          timeMs: 1_500_000,
        },
        {
          key: 'fast',
          gender: 'M',
          birthYear: CONTROL_YEAR - 26,
          startNumber: 1,
          timeMs: 1_400_000,
        },
        {
          key: 'dns',
          gender: 'M',
          birthYear: CONTROL_YEAR - 42,
          startNumber: 2,
          timeMs: null,
        },
        {
          key: 'woman',
          gender: 'F',
          birthYear: CONTROL_YEAR - 32,
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
      categories: [],
    });
    expect(
      event.ageSplits?.every(
        (split) => split.enabled === false && split.categories.length === 0,
      ),
    ).toBe(true);
    expect(rows.every((row) => row.sectionId === 'CATEGORY')).toBe(true);
    expect(placeOf(rows, 'fast')).toBe(1);
    expect(placeOf(rows, 'slow')).toBe(2);
    expect(placeOf(rows, 'dns')).toBeNull();
    expect(placeOf(rows, 'woman')).toBe(1);
  });

  it('renders stored custom categories with their ids, subtitles and places', async () => {
    const { service } = makeHarness({
      people: [
        {
          key: 'young-slow',
          gender: 'M',
          birthYear: CONTROL_YEAR - 16,
          startNumber: 2,
          timeMs: 2_000_000,
        },
        {
          key: 'young-fast',
          gender: 'M',
          birthYear: CONTROL_YEAR - 18,
          startNumber: 1,
          timeMs: 1_000_000,
        },
        {
          key: 'adult-slow',
          gender: 'M',
          birthYear: CONTROL_YEAR - 20,
          startNumber: 4,
          timeMs: 1_500_000,
        },
        {
          key: 'adult-fast',
          gender: 'M',
          birthYear: CONTROL_YEAR - 30,
          startNumber: 3,
          timeMs: 1_200_000,
        },
      ],
      categories: [
        { categoryNumber: 1, groupId: 'AGE_17_18' },
        { categoryNumber: 1, groupId: 'AGE_15_16' },
        { categoryNumber: 2, groupId: 'AGE_24_40' },
        { categoryNumber: 2, groupId: 'AGE_19_20' },
        { categoryNumber: 2, groupId: 'AGE_21_23' },
      ],
    });

    const event = await service.findById(EVENT_ID, { syncStatuses: false });
    const rows = event.registrations ?? [];

    expect(event.ageSplits).toEqual([
      {
        startId: START_ID,
        formatId: FORMAT_ID,
        gender: 'M',
        enabled: true,
        categories: [
          {
            id: 'CATEGORY_1',
            number: 1,
            title: 'Категория 1',
            subtitle: '15–16, 17–18',
            groupIds: ['AGE_15_16', 'AGE_17_18'],
          },
          {
            id: 'CATEGORY_2',
            number: 2,
            title: 'Категория 2',
            subtitle: '19–20, 21–23, 24–40',
            groupIds: ['AGE_19_20', 'AGE_21_23', 'AGE_24_40'],
          },
        ],
      },
    ]);
    expect(sectionOf(rows, 'young-fast')).toBe('CATEGORY_1');
    expect(sectionOf(rows, 'young-slow')).toBe('CATEGORY_1');
    expect(sectionOf(rows, 'adult-fast')).toBe('CATEGORY_2');
    expect(sectionOf(rows, 'adult-slow')).toBe('CATEGORY_2');
    expect(placeOf(rows, 'young-fast')).toBe(1);
    expect(placeOf(rows, 'young-slow')).toBe(2);
    expect(placeOf(rows, 'adult-fast')).toBe(1);
    expect(placeOf(rows, 'adult-slow')).toBe(2);
  });

  it('recomputes places after a finished category change and keeps the finish, times and stored places', async () => {
    const { service, event } = makeHarness({
      people: [
        {
          key: 'young',
          gender: 'M',
          birthYear: CONTROL_YEAR - 21,
          startNumber: 1,
          timeMs: 1_000_000,
          storedPlace: 5,
        },
        {
          key: 'adult',
          gender: 'M',
          birthYear: CONTROL_YEAR - 42,
          startNumber: 2,
          timeMs: 2_000_000,
          storedPlace: 4,
        },
      ],
      categories: [
        { categoryNumber: 1, groupId: 'AGE_21_23' },
        { categoryNumber: 2, groupId: 'AGE_41_50' },
      ],
      finishedCategories: [
        { startId: START_ID, formatId: FORMAT_ID, gender: 'M' },
      ],
    });

    const result = await service.findById(EVENT_ID, { syncStatuses: false });
    const rows = result.registrations ?? [];

    // The saved change splits the category, so both rows earn place 1 inside
    // their own section while the stored `Result.place` snapshots stay 5 and 4.
    expect(sectionOf(rows, 'young')).toBe('CATEGORY_1');
    expect(sectionOf(rows, 'adult')).toBe('CATEGORY_2');
    expect(placeOf(rows, 'young')).toBe(1);
    expect(placeOf(rows, 'adult')).toBe(1);
    expect(rowOf(rows, 'young').finishTimeMs).toBe(1_000_000);
    expect(rowOf(rows, 'adult').finishTimeMs).toBe(2_000_000);
    expect(rowOf(rows, 'young').outcome).toBe('FINISHED');

    // The finish record survives, so the category keeps its «Гонка завершена»
    // tag and the row-editing lock on the next read (S-03/U-31).
    expect(result.finishedCategories).toEqual([
      { startId: START_ID, formatId: FORMAT_ID, gender: 'M' },
    ]);

    const stored = event.registrations as {
      result: { place: number | null; timeMilliseconds: number | null };
      enrollments: {
        result: { place: number | null; timeMilliseconds: number | null };
      }[];
    }[];
    expect(stored.map((row) => row.result.place)).toEqual([5, 4]);
    expect(stored.map((row) => row.enrollments[0].result.place)).toEqual([5, 4]);
    expect(stored.map((row) => row.enrollments[0].result.timeMilliseconds)).toEqual([
      1_000_000, 2_000_000,
    ]);
  });

  it('places unassigned groups into the remainder and future birth years last', async () => {
    const { service } = makeHarness({
      people: [
        {
          key: 'child',
          gender: 'M',
          birthYear: CONTROL_YEAR - 10,
          startNumber: 1,
          timeMs: 1_000_000,
        },
        {
          key: 'older',
          gender: 'M',
          birthYear: CONTROL_YEAR - 47,
          startNumber: 2,
          timeMs: 2_000_000,
        },
        {
          key: 'future',
          gender: 'M',
          birthYear: CONTROL_YEAR + 3,
          startNumber: 3,
          timeMs: 3_000_000,
        },
      ],
      categories: [{ categoryNumber: 1, groupId: 'AGE_LE_14' }],
    });

    const event = await service.findById(EVENT_ID, { syncStatuses: false });
    const rows = event.registrations ?? [];

    expect(event.ageSplits?.[0].enabled).toBe(true);
    expect(event.ageSplits?.[0].categories).toEqual([
      {
        id: 'CATEGORY_1',
        number: 1,
        title: 'Категория 1',
        subtitle: '≤14',
        groupIds: ['AGE_LE_14'],
      },
    ]);
    expect(sectionOf(rows, 'child')).toBe('CATEGORY_1');
    expect(sectionOf(rows, 'older')).toBe('REMAINDER');
    expect(sectionOf(rows, 'future')).toBe('NO_BIRTH_YEAR');
    expect(rows.map((row) => row.sectionId)).toEqual([
      'CATEGORY_1',
      'REMAINDER',
      'NO_BIRTH_YEAR',
    ]);
    expect(placeOf(rows, 'child')).toBe(1);
    expect(placeOf(rows, 'older')).toBe(1);
    expect(placeOf(rows, 'future')).toBe(1);
  });

  it('converts stored legacy sections into categories in stored order', async () => {
    const { service } = makeHarness({
      people: [
        {
          key: 'junior',
          gender: 'M',
          birthYear: CONTROL_YEAR - 20,
          startNumber: 1,
          timeMs: 5_000_000,
        },
        {
          key: 'master-slow',
          gender: 'M',
          birthYear: CONTROL_YEAR - 47,
          startNumber: 2,
          timeMs: 3_000_000,
        },
        {
          key: 'master-fast',
          gender: 'M',
          birthYear: CONTROL_YEAR - 50,
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
        { sectionId: 'AGE_41_50', sectionKind: 'BASE_GROUP', sortOrder: 1 },
      ],
    });

    const event = await service.findById(EVENT_ID, { syncStatuses: false });
    const rows = event.registrations ?? [];

    expect(event.ageSplits?.[0].enabled).toBe(true);
    expect(event.ageSplits?.[0].categories).toEqual([
      {
        id: 'CATEGORY_1',
        number: 1,
        title: 'Категория 1',
        subtitle: '≤14, 15–16, 17–18, 19–20, 21–23',
        groupIds: [
          'AGE_LE_14',
          'AGE_15_16',
          'AGE_17_18',
          'AGE_19_20',
          'AGE_21_23',
        ],
      },
      {
        id: 'CATEGORY_2',
        number: 2,
        title: 'Категория 2',
        subtitle: '41–50',
        groupIds: ['AGE_41_50'],
      },
    ]);
    expect(sectionOf(rows, 'junior')).toBe('CATEGORY_1');
    expect(sectionOf(rows, 'master-fast')).toBe('CATEGORY_2');
    expect(sectionOf(rows, 'master-slow')).toBe('CATEGORY_2');
    expect(placeOf(rows, 'junior')).toBe(1);
    expect(placeOf(rows, 'master-fast')).toBe(1);
    expect(placeOf(rows, 'master-slow')).toBe(2);
  });

  it('prefers new membership rows over legacy sections of the same category', async () => {
    const { service } = makeHarness({
      people: [
        {
          key: 'adult',
          gender: 'M',
          birthYear: CONTROL_YEAR - 30,
          startNumber: 1,
          timeMs: 1_000_000,
        },
        {
          key: 'child',
          gender: 'M',
          birthYear: CONTROL_YEAR - 10,
          startNumber: 2,
          timeMs: 2_000_000,
        },
      ],
      sections: [
        { sectionId: 'AGE_LE_14', sectionKind: 'BASE_GROUP', sortOrder: 0 },
      ],
      categories: [{ categoryNumber: 1, groupId: 'AGE_24_40' }],
    });

    const event = await service.findById(EVENT_ID, { syncStatuses: false });
    const rows = event.registrations ?? [];

    expect(event.ageSplits?.[0].categories).toEqual([
      {
        id: 'CATEGORY_1',
        number: 1,
        title: 'Категория 1',
        subtitle: '24–40',
        groupIds: ['AGE_24_40'],
      },
    ]);
    expect(sectionOf(rows, 'adult')).toBe('CATEGORY_1');
    expect(sectionOf(rows, 'child')).toBe('REMAINDER');
    expect(rows.some((row) => row.sectionId === 'CATEGORY_2')).toBe(false);
  });

  it('ignores legacy rows whose ids are no longer recognized', async () => {
    const { service } = makeHarness({
      people: [
        {
          key: 'rider',
          gender: 'M',
          birthYear: CONTROL_YEAR - 30,
          startNumber: 1,
          timeMs: 1_000_000,
        },
      ],
      sections: [
        { sectionId: 'PRESET_ALL_GROUPS', sectionKind: 'PRESET', sortOrder: 0 },
      ],
    });

    const event = await service.findById(EVENT_ID, { syncStatuses: false });
    const rows = event.registrations ?? [];

    expect(event.ageSplits?.[0]).toEqual({
      startId: START_ID,
      formatId: FORMAT_ID,
      gender: 'M',
      enabled: false,
      categories: [],
    });
    expect(rows.every((row) => row.sectionId === 'CATEGORY')).toBe(true);
  });

  it('keeps a class competition category whole while reporting the stored categories', async () => {
    const { service } = makeHarness({
      bracketGender: 'M',
      people: [
        {
          key: 'young',
          gender: 'M',
          birthYear: CONTROL_YEAR - 10,
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
      categories: [{ categoryNumber: 1, groupId: 'AGE_LE_14' }],
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
      categories: [
        {
          id: 'CATEGORY_1',
          number: 1,
          title: 'Категория 1',
          subtitle: '≤14',
          groupIds: ['AGE_LE_14'],
        },
      ],
    });
  });

  it('omits ageSplits for an event without starts', async () => {
    const { service } = makeHarness({
      starts: 'none',
      categories: [{ categoryNumber: 1, groupId: 'AGE_LE_14' }],
    });

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
          birthYear: CONTROL_YEAR - 37,
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
