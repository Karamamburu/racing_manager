import { describe, expect, it } from 'vitest';
import type {
  AgeCategoryRef,
  AgeGroupId,
  AgeSplitRef,
  CategoryFinishRef,
  EventFormatRef,
  EventParticipant,
  StartResponse,
} from '../../shared/types/event';
import {
  AGE_CATEGORY_GROUPS,
  CATEGORY_TITLE_PREFIX,
  categorySubtitle,
  categoryTitle,
  categoryYoungestBound,
  groupLabel,
  groupRange,
  orderCategoriesByAge,
} from './ageCategories';
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

function category(
  id: string,
  number: number,
  groupIds: AgeGroupId[],
  subtitle: string,
): AgeCategoryRef {
  return {
    id,
    number,
    title: categoryTitle(number),
    subtitle,
    groupIds,
  };
}

function split(overrides: Partial<AgeSplitRef> = {}): AgeSplitRef {
  return {
    startId: 'start-a',
    formatId: 1,
    gender: 'M',
    enabled: true,
    categories: [],
    sections: [],
    ...overrides,
  };
}

describe('age category catalog', () => {
  it('lists the nine base groups in ascending age order', () => {
    expect(AGE_CATEGORY_GROUPS.map((group) => group.id)).toEqual([
      'AGE_LE_14',
      'AGE_15_16',
      'AGE_17_18',
      'AGE_19_20',
      'AGE_21_23',
      'AGE_24_40',
      'AGE_41_50',
      'AGE_51_60',
      'AGE_61_PLUS',
    ]);
    expect(AGE_CATEGORY_GROUPS.map((group) => group.range)).toEqual([
      '≤14',
      '15–16',
      '17–18',
      '19–20',
      '21–23',
      '24–40',
      '41–50',
      '51–60',
      '61+',
    ]);
    expect(AGE_CATEGORY_GROUPS.map((group) => group.youngestBound)).toEqual([
      0, 15, 17, 19, 21, 24, 41, 51, 61,
    ]);
  });

  it('derives the automatic category title from its number', () => {
    expect(CATEGORY_TITLE_PREFIX).toBe('Возрастная категория');
    expect(categoryTitle(3)).toBe('Возрастная категория 3');
  });

  it('labels and ranges a base group per gender', () => {
    expect(groupRange('AGE_61_PLUS')).toBe('61+');
    expect(groupLabel('AGE_24_40', 'M')).toBe('Мужчины');
    expect(groupLabel('AGE_24_40', 'F')).toBe('Женщины');
    expect(groupLabel('AGE_41_50', 'F')).toBe('Мастер 1');
  });

  it('joins member ranges in catalog order regardless of input order', () => {
    expect(categorySubtitle(['AGE_41_50', 'AGE_24_40'])).toBe('24–40, 41–50');
    expect(categorySubtitle([])).toBe('');
  });

  it('takes the youngest member bound and treats an empty list as unbounded', () => {
    expect(categoryYoungestBound(['AGE_41_50', 'AGE_24_40'])).toBe(24);
    expect(categoryYoungestBound([])).toBe(Number.POSITIVE_INFINITY);
  });

  it('orders categories by youngest bound, stably for ties', () => {
    const entries: Array<{ name: string; groupIds: readonly AgeGroupId[] }> = [
      { name: 'masters', groupIds: ['AGE_41_50'] },
      { name: 'adults', groupIds: ['AGE_24_40'] },
      { name: 'adults-and-masters', groupIds: ['AGE_24_40', 'AGE_41_50'] },
    ];

    expect(orderCategoriesByAge(entries).map((entry) => entry.name)).toEqual([
      'adults',
      'adults-and-masters',
      'masters',
    ]);
  });
});

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
    expect(section.ageSections).toEqual([
      {
        key: 'CATEGORY',
        title: null,
        subtitle: null,
        rows: section.rows,
      },
    ]);
    expect(section.ageSections[0].rows.map((row) => row.enrollmentId)).toEqual([
      'a',
      'b',
    ]);
  });

  it('renders configured categories youngest first even when the payload lists masters first', () => {
    const groups = groupParticipants(
      [
        participant({ enrollmentId: 'master', sectionId: 'CATEGORY_1' }),
        participant({ enrollmentId: 'young', sectionId: 'CATEGORY_2' }),
      ],
      formats,
      [start('start-a', 0, 'Старт A')],
      [
        split({
          categories: [
            category('CATEGORY_1', 1, ['AGE_41_50'], '41–50'),
            category('CATEGORY_2', 2, ['AGE_24_40'], '24–40'),
          ],
        }),
      ],
    );

    const ageSections = groups[0].sections[0].ageSections;
    expect(ageSections.map((item) => item.key)).toEqual([
      'CATEGORY_2',
      'CATEGORY_1',
    ]);
    expect(ageSections.map((item) => item.title)).toEqual([
      'Возрастная категория 2',
      'Возрастная категория 1',
    ]);
    expect(ageSections[0].rows.map((row) => row.enrollmentId)).toEqual([
      'young',
    ]);
    expect(ageSections[1].rows.map((row) => row.enrollmentId)).toEqual([
      'master',
    ]);
  });

  it('carries the stored subtitle through to the section', () => {
    const groups = groupParticipants(
      [participant({ enrollmentId: 'teen', sectionId: 'CATEGORY_1' })],
      formats,
      [start('start-a', 0, 'Старт A')],
      [
        split({
          categories: [
            category(
              'CATEGORY_1',
              1,
              ['AGE_15_16', 'AGE_17_18'],
              '15–16, 17–18',
            ),
          ],
        }),
      ],
    );

    expect(groups[0].sections[0].ageSections[0]).toMatchObject({
      key: 'CATEGORY_1',
      title: 'Возрастная категория 1',
      subtitle: '15–16, 17–18',
    });
  });

  it('renders a preset-like multi-group category as one section', () => {
    const groups = groupParticipants(
      [participant({ enrollmentId: 'junior', sectionId: 'CATEGORY_1' })],
      formats,
      [start('start-a', 0, 'Старт A')],
      [
        split({
          categories: [
            category(
              'CATEGORY_1',
              1,
              [
                'AGE_LE_14',
                'AGE_15_16',
                'AGE_17_18',
                'AGE_19_20',
                'AGE_21_23',
              ],
              '≤14, 15–16, 17–18, 19–20, 21–23',
            ),
          ],
        }),
      ],
    );

    const ageSections = groups[0].sections[0].ageSections;
    expect(ageSections).toHaveLength(1);
    expect(ageSections[0]).toMatchObject({
      key: 'CATEGORY_1',
      title: 'Возрастная категория 1',
      subtitle: '≤14, 15–16, 17–18, 19–20, 21–23',
    });
    expect(ageSections[0].rows.map((row) => row.enrollmentId)).toEqual([
      'junior',
    ]);
  });

  it('renders REMAINDER then NO_BIRTH_YEAR after every category', () => {
    const groups = groupParticipants(
      [
        participant({ enrollmentId: 'no-year', sectionId: 'NO_BIRTH_YEAR' }),
        participant({ enrollmentId: 'leftover', sectionId: 'REMAINDER' }),
        participant({ enrollmentId: 'adult', sectionId: 'CATEGORY_1' }),
      ],
      formats,
      [start('start-a', 0, 'Старт A')],
      [
        split({
          categories: [category('CATEGORY_1', 1, ['AGE_24_40'], '24–40')],
        }),
      ],
    );

    const ageSections = groups[0].sections[0].ageSections;
    expect(ageSections.map((item) => item.key)).toEqual([
      'CATEGORY_1',
      'REMAINDER',
      'NO_BIRTH_YEAR',
    ]);
    expect(ageSections.map((item) => item.title)).toEqual([
      'Возрастная категория 1',
      REMAINDER_SECTION_TITLE,
      NO_BIRTH_YEAR_SECTION_TITLE,
    ]);
    expect(ageSections.map((item) => item.subtitle)).toEqual([
      '24–40',
      null,
      null,
    ]);
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
      [
        split({
          categories: [category('CATEGORY_1', 1, ['AGE_24_40'], '24–40')],
        }),
      ],
    );

    const section = groups[0].sections[0];
    expect(section.ageSections).toEqual([
      {
        key: 'CATEGORY',
        title: null,
        subtitle: null,
        rows: section.rows,
      },
    ]);
    expect(section.ageSections[0].rows).toHaveLength(2);
  });

  it('drops configured categories without rows', () => {
    const groups = groupParticipants(
      [participant({ enrollmentId: 'adult', sectionId: 'CATEGORY_1' })],
      formats,
      [start('start-a', 0, 'Старт A')],
      [
        split({
          categories: [
            category('CATEGORY_1', 1, ['AGE_24_40'], '24–40'),
            category('CATEGORY_2', 2, ['AGE_41_50'], '41–50'),
          ],
        }),
      ],
    );

    const ageSections = groups[0].sections[0].ageSections;
    expect(ageSections.map((item) => item.key)).toEqual(['CATEGORY_1']);
  });

  it('appends an unknown section id with the id as its title', () => {
    const groups = groupParticipants(
      [
        participant({ enrollmentId: 'adult', sectionId: 'CATEGORY_1' }),
        participant({ enrollmentId: 'mystery', sectionId: 'AGE_99_PLUS' }),
      ],
      formats,
      [start('start-a', 0, 'Старт A')],
      [
        split({
          categories: [category('CATEGORY_1', 1, ['AGE_24_40'], '24–40')],
        }),
      ],
    );

    const ageSections = groups[0].sections[0].ageSections;
    expect(ageSections.map((item) => item.key)).toEqual([
      'CATEGORY_1',
      'AGE_99_PLUS',
    ]);
    expect(ageSections[1].title).toBe('AGE_99_PLUS');
    expect(ageSections[1].subtitle).toBeNull();
    expect(ageSections[1].rows.map((row) => row.enrollmentId)).toEqual([
      'mystery',
    ]);
  });

  it('keeps the split of one category away from its siblings', () => {
    const groups = groupParticipants(
      [
        participant({ enrollmentId: 'male', sectionId: 'CATEGORY_1' }),
        participant({
          enrollmentId: 'female',
          gender: 'F',
          sectionId: 'AGE_41_50',
        }),
      ],
      formats,
      [start('start-a', 0, 'Старт A')],
      [
        split({
          categories: [category('CATEGORY_1', 1, ['AGE_24_40'], '24–40')],
        }),
      ],
    );

    expect(groups[0].sections[0].ageSections.map((item) => item.key)).toEqual([
      'CATEGORY_1',
    ]);
    expect(groups[1].sections[0].ageSections.map((item) => item.key)).toEqual([
      'CATEGORY',
    ]);
  });

  it('does not mutate the participant array, its rows or the categories', () => {
    const rows = [
      participant({ enrollmentId: 'adult', sectionId: 'CATEGORY_1' }),
      participant({ enrollmentId: 'leftover', sectionId: 'REMAINDER' }),
    ];
    const categories = [
      category('CATEGORY_1', 1, ['AGE_41_50'], '41–50'),
      category('CATEGORY_2', 2, ['AGE_24_40'], '24–40'),
    ];
    const rowSnapshot = rows.map((row) => ({ ...row }));
    const categorySnapshot = categories.map((item) => ({
      ...item,
      groupIds: [...item.groupIds],
    }));
    const splitRef = split({ categories });

    groupParticipants(rows, formats, [start('start-a', 0, 'Старт A')], [
      splitRef,
    ]);

    expect(rows).toEqual(rowSnapshot);
    expect(categories).toEqual(categorySnapshot);
    expect(categories.map((item) => item.id)).toEqual([
      'CATEGORY_1',
      'CATEGORY_2',
    ]);
    expect(splitRef.categories).toBe(categories);
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
