import { describe, expect, it } from 'vitest';
import type {
  CategoryFinishRef,
  EventFormatRef,
  EventParticipant,
  StartResponse,
} from '../../shared/types/event';
import {
  categoryHasResults,
  categoryIsFinished,
  categoryReadyToFinish,
  groupParticipants,
} from './protocolGroups';

const formats: EventFormatRef[] = [
  { id: 1, code: '5K', name: '5 км', sortOrder: 1 },
  { id: 2, code: '10K', name: '10 км', sortOrder: 2 },
];

function start(
  id: string,
  sortOrder: number,
  resolvedLabel: string,
  formatIds = [1, 2],
): StartResponse {
  return {
    id,
    purposeType: 'CUP_RACE',
    formatIds,
    lapCount: 1,
    lapLengthMeters: 1000,
    displayName: null,
    sortOrder,
    resolvedLabel,
    legacyEffectiveDistanceM: null,
    displayedDistanceMeters: 1000,
  };
}

function participant(
  overrides: Partial<EventParticipant> = {},
): EventParticipant {
  return {
    id: 'registration-1',
    enrollmentId: 'enrollment-1',
    startId: 'start-a',
    startLabel: 'Старт A',
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
    sectionId: 'CATEGORY',
    ...overrides,
  };
}

describe('groupParticipants', () => {
  it('partitions by gender, then start order, then format order', () => {
    const groups = groupParticipants(
      [
        participant({
          enrollmentId: 'a2',
          startId: 'start-b',
          startLabel: 'Старт B',
          format: formats[1],
        }),
        participant({ enrollmentId: 'a1', startId: 'start-a' }),
        participant({
          enrollmentId: 'f1',
          startId: 'start-a',
          gender: 'F',
          fullName: 'Анна Тестова',
        }),
      ],
      formats,
      [start('start-a', 0, 'Старт A'), start('start-b', 1, 'Старт B')],
    );

    expect(groups.map((group) => group.key)).toEqual(['M', 'F']);
    expect(groups[0].sections.map((section) => section.key)).toEqual([
      'start-a-1-M',
      'start-b-2-M',
    ]);
    expect(groups[0].sections[0].title).toBe('Старт A · 5 км');
    expect(groups[1].sections[0].key).toBe('start-a-1-F');
  });

  it('keeps sibling starts in separate sections even with one format', () => {
    const groups = groupParticipants(
      [
        participant({ enrollmentId: 'a', startId: 'start-a' }),
        participant({ enrollmentId: 'b', startId: 'start-b' }),
      ],
      formats,
      [start('start-a', 0, 'Кубок'), start('start-b', 1, 'Разминка')],
    );

    expect(groups[0].sections).toHaveLength(2);
    expect(
      groups[0].sections.map((section) => section.rows[0].enrollmentId),
    ).toEqual(['a', 'b']);
  });
});

describe('category readiness', () => {
  it('treats an outcome as a filled result', () => {
    expect(categoryHasResults([participant({ outcome: 'DNS' })])).toBe(true);
    expect(
      categoryReadyToFinish([
        participant({ outcome: 'FINISHED', finishTimeMs: 3_600_000 }),
        participant({ enrollmentId: 'e2', outcome: 'DNF' }),
      ]),
    ).toBe(true);
  });

  it('is not ready while a ranked participant has no outcome', () => {
    expect(
      categoryReadyToFinish([
        participant({ outcome: 'FINISHED', finishTimeMs: 3_600_000 }),
        participant({ enrollmentId: 'e2' }),
      ]),
    ).toBe(false);
  });
});

describe('categoryIsFinished', () => {
  it('includes startId in the finish key', () => {
    const finishes: CategoryFinishRef[] = [
      { startId: 'start-a', formatId: 1, gender: 'M' },
    ];

    expect(categoryIsFinished(finishes, 'start-a', 1, 'M')).toBe(true);
    expect(categoryIsFinished(finishes, 'start-b', 1, 'M')).toBe(false);
    expect(categoryIsFinished(finishes, 'start-a', 2, 'M')).toBe(false);
  });
});
