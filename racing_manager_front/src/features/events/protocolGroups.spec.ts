import { describe, expect, it } from 'vitest';
import type {
  AgeSectionRef,
  AgeSplitRef,
  CategoryFinishRef,
  EventFormatRef,
  EventParticipant,
  StartResponse,
} from '../../shared/types/event';
import {
  NO_BIRTH_YEAR_SECTION_TITLE,
  REMAINDER_SECTION_TITLE,
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

function baseSection(id: string, title: string): AgeSectionRef {
  return { id, kind: 'BASE_GROUP', title };
}

function presetSection(id: string, title: string): AgeSectionRef {
  return { id, kind: 'PRESET', title };
}

function split(overrides: Partial<AgeSplitRef> = {}): AgeSplitRef {
  return {
    startId: 'start-a',
    formatId: 1,
    gender: 'M',
    enabled: true,
    sections: [],
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

describe('age sections', () => {
  it('collapses an unsplit category into one headerless CATEGORY section', () => {
    const groups = groupParticipants(
      [
        participant({ enrollmentId: 'a' }),
        participant({ enrollmentId: 'b', fullName: 'Пётр Тестов' }),
      ],
      formats,
      [start('start-a', 0, 'Старт A')],
    );

    const section = groups[0].sections[0];
    expect(section.ageSections).toHaveLength(1);
    expect(section.ageSections[0].key).toBe('CATEGORY');
    expect(section.ageSections[0].title).toBeNull();
    expect(section.ageSections[0].rows.map((row) => row.enrollmentId)).toEqual([
      'a',
      'b',
    ]);
    expect(section.ageSections[0].rows).toEqual(section.rows);
  });

  it('renders configured base sections in payload order', () => {
    const groups = groupParticipants(
      [
        participant({ enrollmentId: 'young', sectionId: 'AGE_24_40' }),
        participant({ enrollmentId: 'master', sectionId: 'AGE_41_50' }),
      ],
      formats,
      [start('start-a', 0, 'Старт A')],
      [
        split({
          sections: [
            baseSection('AGE_41_50', 'Мастер 1 (41–50)'),
            baseSection('AGE_24_40', 'Мужчины (24–40)'),
          ],
        }),
      ],
    );

    const section = groups[0].sections[0];
    expect(section.ageSections.map((item) => item.key)).toEqual([
      'AGE_41_50',
      'AGE_24_40',
    ]);
    expect(section.ageSections.map((item) => item.title)).toEqual([
      'Мастер 1 (41–50)',
      'Мужчины (24–40)',
    ]);
    expect(section.ageSections[0].rows.map((row) => row.enrollmentId)).toEqual([
      'master',
    ]);
    expect(section.ageSections[1].rows.map((row) => row.enrollmentId)).toEqual([
      'young',
    ]);
    expect(section.rows.map((row) => row.enrollmentId)).toEqual([
      'young',
      'master',
    ]);
  });

  it('appends REMAINDER after a combined preset', () => {
    const groups = groupParticipants(
      [
        participant({
          enrollmentId: 'junior',
          sectionId: 'PRESET_JUNIOR_UNDER_24',
        }),
        participant({ enrollmentId: 'leftover', sectionId: 'REMAINDER' }),
      ],
      formats,
      [start('start-a', 0, 'Старт A')],
      [
        split({
          sections: [
            presetSection(
              'PRESET_JUNIOR_UNDER_24',
              'Юниоры и младше (<24)',
            ),
          ],
        }),
      ],
    );

    const ageSections = groups[0].sections[0].ageSections;
    expect(ageSections.map((item) => item.key)).toEqual([
      'PRESET_JUNIOR_UNDER_24',
      'REMAINDER',
    ]);
    expect(ageSections[1].title).toBe(REMAINDER_SECTION_TITLE);
  });

  it('renders NO_BIRTH_YEAR last and after REMAINDER', () => {
    const groups = groupParticipants(
      [
        participant({ enrollmentId: 'no-year', sectionId: 'NO_BIRTH_YEAR' }),
        participant({ enrollmentId: 'leftover', sectionId: 'REMAINDER' }),
        participant({ enrollmentId: 'adult', sectionId: 'AGE_24_40' }),
      ],
      formats,
      [start('start-a', 0, 'Старт A')],
      [split({ sections: [baseSection('AGE_24_40', 'Мужчины (24–40)')] })],
    );

    const ageSections = groups[0].sections[0].ageSections;
    expect(ageSections.map((item) => item.key)).toEqual([
      'AGE_24_40',
      'REMAINDER',
      'NO_BIRTH_YEAR',
    ]);
    expect(ageSections[2].title).toBe(NO_BIRTH_YEAR_SECTION_TITLE);
    expect(ageSections[2].rows.map((row) => row.enrollmentId)).toEqual([
      'no-year',
    ]);
  });

  it('renders a split suppressed by a class competition as one CATEGORY section', () => {
    const groups = groupParticipants(
      [
        participant({ enrollmentId: 'a', sectionId: 'CATEGORY' }),
        participant({ enrollmentId: 'b', sectionId: 'CATEGORY' }),
      ],
      formats,
      [start('start-a', 0, 'Старт A')],
      [split({ sections: [baseSection('AGE_24_40', 'Мужчины (24–40)')] })],
    );

    const section = groups[0].sections[0];
    expect(section.ageSections).toHaveLength(1);
    expect(section.ageSections[0]).toEqual({
      key: 'CATEGORY',
      title: null,
      rows: section.rows,
    });
    expect(section.ageSections[0].rows).toHaveLength(2);
  });

  it('drops configured sections without rows', () => {
    const groups = groupParticipants(
      [participant({ enrollmentId: 'adult', sectionId: 'AGE_24_40' })],
      formats,
      [start('start-a', 0, 'Старт A')],
      [
        split({
          sections: [
            baseSection('AGE_24_40', 'Мужчины (24–40)'),
            baseSection('AGE_41_50', 'Мастер 1 (41–50)'),
          ],
        }),
      ],
    );

    const ageSections = groups[0].sections[0].ageSections;
    expect(ageSections.map((item) => item.key)).toEqual(['AGE_24_40']);
  });

  it('appends an unknown section id with the id as its title', () => {
    const groups = groupParticipants(
      [
        participant({ enrollmentId: 'adult', sectionId: 'AGE_24_40' }),
        participant({ enrollmentId: 'mystery', sectionId: 'AGE_99_PLUS' }),
      ],
      formats,
      [start('start-a', 0, 'Старт A')],
      [split({ sections: [baseSection('AGE_24_40', 'Мужчины (24–40)')] })],
    );

    const ageSections = groups[0].sections[0].ageSections;
    expect(ageSections.map((item) => item.key)).toEqual([
      'AGE_24_40',
      'AGE_99_PLUS',
    ]);
    expect(ageSections[1].title).toBe('AGE_99_PLUS');
    expect(ageSections[1].rows.map((row) => row.enrollmentId)).toEqual([
      'mystery',
    ]);
  });

  it('keeps the split of one category away from its siblings', () => {
    const groups = groupParticipants(
      [
        participant({ enrollmentId: 'male', sectionId: 'AGE_24_40' }),
        participant({
          enrollmentId: 'female',
          gender: 'F',
          sectionId: 'AGE_41_50',
        }),
      ],
      formats,
      [start('start-a', 0, 'Старт A')],
      [split({ sections: [baseSection('AGE_24_40', 'Мужчины (24–40)')] })],
    );

    expect(groups[0].sections[0].ageSections.map((item) => item.key)).toEqual([
      'AGE_24_40',
    ]);
    expect(groups[1].sections[0].ageSections.map((item) => item.key)).toEqual([
      'CATEGORY',
    ]);
  });

  it('does not mutate the participant array or its rows', () => {
    const rows = [
      participant({ enrollmentId: 'adult', sectionId: 'AGE_24_40' }),
      participant({ enrollmentId: 'leftover', sectionId: 'REMAINDER' }),
    ];
    const snapshot = rows.map((row) => ({ ...row }));

    groupParticipants(rows, formats, [start('start-a', 0, 'Старт A')], [
      split({ sections: [baseSection('AGE_24_40', 'Мужчины (24–40)')] }),
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(snapshot[0]);
    expect(rows[1]).toEqual(snapshot[1]);
    expect(rows.map((row) => row.sectionId)).toEqual([
      'AGE_24_40',
      'REMAINDER',
    ]);
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
