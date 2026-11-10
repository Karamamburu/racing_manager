import { describe, expect, it } from 'vitest';
import { categoryTitle } from '../../features/events/ageCategories';
import {
  categoryReadyToFinish,
  groupParticipants,
} from '../../features/events/protocolGroups';
import { filterProtocolGroups } from '../../features/events/protocolFilters';
import type {
  AgeCategoryRef,
  AgeGroupId,
  AgeSplitRef,
  EventFormatRef,
  EventParticipant,
  StartResponse,
} from '../../shared/types/event';
import {
  AGE_SPLIT_BLOCKING_EVENT_STATUSES,
  resolveAgeSplitSelection,
  type AgeSplitSelectionInput,
} from './index';

const base: AgeSplitSelectionInput = {
  roles: ['ADMINISTRATOR'],
  eventStatus: 'PLANNED',
  bracketInProgress: false,
  hasStarts: true,
  rowCount: 3,
  startId: 'start-a',
  formatId: 1,
  gender: 'M',
  startLabel: 'Кубковая гонка — 10 км',
  formatName: '10 км',
};

const selection = {
  startId: 'start-a',
  formatId: 1,
  gender: 'M',
  startLabel: 'Кубковая гонка — 10 км',
  formatName: '10 км',
};

describe('EventPage «Возрастные категории» gating', () => {
  it('offers the control to an administrator on a category with rows', () => {
    expect(resolveAgeSplitSelection(base)).toEqual(selection);
  });

  it('offers the control to an organizer on a category with rows', () => {
    expect(
      resolveAgeSplitSelection({ ...base, roles: ['ORGANIZER'] }),
    ).toEqual(selection);
  });

  it('offers no control to any other role', () => {
    const otherRoles: (string[] | undefined)[] = [
      ['USER'],
      ['PARTICIPANT'],
      [],
      undefined,
    ];
    for (const roles of otherRoles) {
      expect(resolveAgeSplitSelection({ ...base, roles })).toBeNull();
    }
  });

  it('offers no control when the protocol category has no rows', () => {
    expect(resolveAgeSplitSelection({ ...base, rowCount: 0 })).toBeNull();
  });

  it('offers no control when the event has no starts', () => {
    expect(resolveAgeSplitSelection({ ...base, hasStarts: false })).toBeNull();
  });

  it('offers no control while a multi-stage race is in progress', () => {
    expect(
      resolveAgeSplitSelection({ ...base, bracketInProgress: true }),
    ).toBeNull();
  });

  it('offers no control for a format or gender that is not a protocol category', () => {
    expect(resolveAgeSplitSelection({ ...base, formatId: null })).toBeNull();
    expect(resolveAgeSplitSelection({ ...base, gender: '' })).toBeNull();
  });

  it('keeps the control on a finished event', () => {
    expect(AGE_SPLIT_BLOCKING_EVENT_STATUSES).toEqual([]);
    expect(
      resolveAgeSplitSelection({ ...base, eventStatus: 'FINISHED' }),
    ).toEqual(selection);
  });

  it('keeps the control on a cancelled event', () => {
    expect(
      resolveAgeSplitSelection({ ...base, eventStatus: 'CANCELLED' }),
    ).toEqual(selection);
  });
});

const formats: EventFormatRef[] = [
  { id: 1, code: '10K', name: '10 км', sortOrder: 1 },
];

const starts: StartResponse[] = [
  {
    id: 'start-a',
    purposeType: 'CUP_RACE',
    formatIds: [1],
    lapCount: 1,
    lapLengthMeters: 1000,
    displayName: null,
    sortOrder: 1,
    resolvedLabel: 'Кубковая гонка',
    legacyEffectiveDistanceM: null,
    displayedDistanceMeters: 1000,
  },
];

function category(
  number: number,
  groupIds: AgeGroupId[],
): AgeCategoryRef {
  return {
    id: `CATEGORY_${number}`,
    number,
    title: categoryTitle(number),
    subtitle: '',
    groupIds,
  };
}

const split: AgeSplitRef = {
  startId: 'start-a',
  formatId: 1,
  gender: 'M',
  enabled: true,
  categories: [category(1, ['AGE_24_40']), category(2, ['AGE_41_50'])],
};

function participant(
  overrides: Partial<EventParticipant> = {},
): EventParticipant {
  return {
    id: 'registration-1',
    enrollmentId: 'enrollment-1',
    startId: 'start-a',
    startLabel: 'Кубковая гонка',
    sortOrder: 0,
    enrollmentStatus: 'REGISTERED',
    userId: null,
    fullName: 'Иван Тестов',
    birthYear: 1990,
    gender: 'M',
    city: null,
    district: null,
    team: null,
    startNumber: 1,
    finishTimeMs: null,
    outcome: null,
    place: null,
    format: formats[0],
    laps: [],
    status: 'REGISTERED',
    isCupEligible: true,
    note: null,
    registeredAt: '2026-11-07T00:00:00.000Z',
    sectionId: 'CATEGORY_1',
    ...overrides,
  };
}

const rows: EventParticipant[] = [
  participant({
    id: 'row-young',
    fullName: 'Иван Молодой',
    sectionId: 'CATEGORY_1',
    startNumber: 1,
    outcome: 'FINISHED',
    finishTimeMs: 3_600_000,
    place: 1,
  }),
  participant({
    id: 'row-master',
    fullName: 'Иван Опытный',
    sectionId: 'CATEGORY_1',
    startNumber: 2,
    outcome: 'FINISHED',
    finishTimeMs: 3_700_000,
    place: 2,
  }),
  participant({
    id: 'row-hidden',
    fullName: 'Пётр Ветеранов',
    sectionId: 'CATEGORY_2',
    startNumber: 3,
  }),
];

const activeFilter = { query: 'молодой', cities: [], teams: [] };

describe('EventPage age sections under an active protocol filter', () => {
  const groups = groupParticipants(rows, formats, starts, [split]);

  it('hides the age categories whose rows are all filtered out', () => {
    const section = filterProtocolGroups(groups, activeFilter)[0].sections[0];

    expect(section.ageSections.map((item) => item.key)).toEqual([
      'CATEGORY_1',
    ]);
    expect(section.ageSections.map((item) => item.title)).toContain(
      categoryTitle(1),
    );
    expect(section.ageSections.map((item) => item.title)).not.toContain(
      categoryTitle(2),
    );
  });

  it('counts displayed rows instead of the full age-section rows', () => {
    const section = filterProtocolGroups(groups, activeFilter)[0].sections[0];
    const ageSection = section.ageSections[0];

    expect(ageSection.rows).toHaveLength(2);
    expect(ageSection.visibleRows).toHaveLength(1);
    expect(section.visibleRows).toHaveLength(1);
  });

  it('keeps the full protocol-category row set for category actions', () => {
    const section = filterProtocolGroups(groups, activeFilter)[0].sections[0];

    expect(section.rows.map((row) => row.id)).toEqual([
      'row-young',
      'row-master',
      'row-hidden',
    ]);
    // The row hidden by the filter has no result, so «Завершить гонку» stays
    // disabled; the visible subset alone would read as ready, which U-28
    // forbids for category-level actions.
    expect(categoryReadyToFinish(section.rows)).toBe(false);
    expect(categoryReadyToFinish(section.visibleRows)).toBe(true);
  });
});
