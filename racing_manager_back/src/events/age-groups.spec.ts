import {
  AGE_GROUPS,
  AGE_PRESETS,
  CATEGORY_TITLE_PREFIX,
  NO_BIRTH_YEAR_TITLE,
  REMAINDER_TITLE,
  ageGroupFor,
  categoriesFromStoredRows,
  categoryForBirthYear,
  categorySectionId,
  categorySubtitle,
  categoryTitle,
  categoryYoungestBound,
  convertLegacySections,
  groupIdsInSection,
  isAgeGroupId,
  isAgePresetId,
  isStoredSectionId,
  normalizeAgeCategories,
  orderCategoriesByAge,
  orderSections,
  resolveControlYear,
  sectionForBirthYear,
  sectionTitle,
  type AgeCategory,
  type AgeCategorySectionId,
  type AgeGroupId,
  type StoredAgeSection,
} from './age-groups';

function moscowDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00+03:00`);
}

function section(
  sectionId: StoredAgeSection['sectionId'],
  sectionKind: StoredAgeSection['sectionKind'],
  sortOrder: number,
): StoredAgeSection {
  return { sectionId, sectionKind, sortOrder };
}

describe('age-groups', () => {
  describe('AGE_GROUPS', () => {
    it('lists the nine base groups ordered by age', () => {
      expect(AGE_GROUPS.map((group) => group.id)).toEqual([
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
    });

    it('uses the FLGR display ranges and the youngest bound per group', () => {
      expect(
        AGE_GROUPS.map((group) => [group.displayRange, group.youngestBound]),
      ).toEqual([
        ['≤14', 0],
        ['15–16', 15],
        ['17–18', 17],
        ['19–20', 19],
        ['21–23', 21],
        ['24–40', 24],
        ['41–50', 41],
        ['51–60', 51],
        ['61+', 61],
      ]);
    });

    it('uses contiguous inclusive bands with no lower bound above 0 and no upper bound at 61+', () => {
      expect(AGE_GROUPS[0]).toMatchObject({ minAge: 0, maxAge: 14 });
      expect(AGE_GROUPS[8]).toMatchObject({ minAge: 61, maxAge: null });
      for (let index = 0; index < AGE_GROUPS.length - 1; index += 1) {
        expect(AGE_GROUPS[index].maxAge).toBe(AGE_GROUPS[index + 1].minAge - 1);
      }
      expect(AGE_GROUPS[0].youngestBound).toBe(0);
      expect(
        AGE_GROUPS.slice(1).every(
          (group) => group.youngestBound === group.minAge,
        ),
      ).toBe(true);
    });

    it('carries the per-gender FLGR labels', () => {
      expect(AGE_GROUPS[0].labels).toEqual({
        M: 'Юноши младшего возраста',
        F: 'Девушки младшего возраста',
      });
      expect(AGE_GROUPS[1].labels).toEqual({
        M: 'Юноши среднего возраста',
        F: 'Девушки среднего возраста',
      });
      expect(AGE_GROUPS[2].labels).toEqual({
        M: 'Юноши старшего возраста',
        F: 'Девушки старшего возраста',
      });
      expect(AGE_GROUPS[3].labels).toEqual({ M: 'Юниоры', F: 'Юниорки' });
      expect(AGE_GROUPS[4].labels).toEqual({ M: 'Юниоры', F: 'Юниорки' });
      expect(AGE_GROUPS[5].labels).toEqual({ M: 'Мужчины', F: 'Женщины' });
      expect(AGE_GROUPS[6].labels).toEqual({ M: 'Мастер 1', F: 'Мастер 1' });
      expect(AGE_GROUPS[7].labels).toEqual({ M: 'Мастер 2', F: 'Мастер 2' });
      expect(AGE_GROUPS[8].labels).toEqual({ M: 'Мастер 3', F: 'Мастер 3' });
    });
  });

  describe('AGE_PRESETS', () => {
    it('defines the junior preset over the five groups up to 21–23', () => {
      expect(AGE_PRESETS[0]).toEqual({
        id: 'PRESET_JUNIOR_UNDER_24',
        title: 'Юниоры и младше (<24)',
        groupIds: [
          'AGE_LE_14',
          'AGE_15_16',
          'AGE_17_18',
          'AGE_19_20',
          'AGE_21_23',
        ],
        youngestBound: 0,
      });
    });

    it('defines the masters preset over the three groups from 41–50', () => {
      expect(AGE_PRESETS[1]).toEqual({
        id: 'PRESET_MASTERS_41_PLUS',
        title: 'Мастера 41+',
        groupIds: ['AGE_41_50', 'AGE_51_60', 'AGE_61_PLUS'],
        youngestBound: 41,
      });
    });

    it('keeps the two presets disjoint and inside the catalog', () => {
      const junior = AGE_PRESETS[0].groupIds;
      const masters = AGE_PRESETS[1].groupIds;
      expect(junior.filter((id) => masters.includes(id))).toEqual([]);
      const catalog = AGE_GROUPS.map((group) => group.id);
      expect([...junior, ...masters].every((id) => catalog.includes(id))).toBe(
        true,
      );
      expect(
        catalog.filter((id) => !junior.includes(id) && !masters.includes(id)),
      ).toEqual(['AGE_24_40']);
    });
  });

  describe('resolveControlYear', () => {
    it.each([
      ['2026-11-10', 2027],
      ['2027-03-01', 2027],
      ['2026-06-30', 2026],
      ['2026-07-01', 2027],
    ])(
      'maps the Moscow calendar date %s to control year %i',
      (isoDate, expected) => {
        expect(resolveControlYear(moscowDate(isoDate))).toBe(expected);
      },
    );

    it('uses the Moscow calendar date for a UTC instant late on 30 June', () => {
      expect(resolveControlYear(new Date('2026-06-30T21:30:00Z'))).toBe(2027);
    });
  });

  describe('ageGroupFor', () => {
    it.each([
      [2006, 'AGE_21_23'],
      [2003, 'AGE_24_40'],
      [1985, 'AGE_41_50'],
      [2013, 'AGE_LE_14'],
    ] as const)(
      'maps birth year %i to %s for control year 2027',
      (birthYear, expected) => {
        expect(ageGroupFor(birthYear, 2027)).toBe(expected);
      },
    );

    it.each([
      [14, 'AGE_LE_14'],
      [15, 'AGE_15_16'],
      [16, 'AGE_15_16'],
      [23, 'AGE_21_23'],
      [24, 'AGE_24_40'],
      [40, 'AGE_24_40'],
      [41, 'AGE_41_50'],
      [61, 'AGE_61_PLUS'],
    ] as const)(
      'places age %i in %s at the inclusive band edges',
      (age, expected) => {
        expect(ageGroupFor(2027 - age, 2027)).toBe(expected);
      },
    );

    it('treats a null or future birth year as unusable', () => {
      expect(ageGroupFor(null, 2027)).toBeNull();
      expect(ageGroupFor(2030, 2027)).toBeNull();
    });
  });

  describe('sectionForBirthYear', () => {
    const sections: StoredAgeSection[] = [
      section('AGE_24_40', 'BASE_GROUP', 0),
      section('PRESET_JUNIOR_UNDER_24', 'PRESET', 0),
    ];

    it('returns the preset id for a group covered by a preset', () => {
      expect(sectionForBirthYear(2006, 2027, sections)).toBe(
        'PRESET_JUNIOR_UNDER_24',
      );
    });

    it('returns the base section id for a covered base group', () => {
      expect(sectionForBirthYear(2003, 2027, sections)).toBe('AGE_24_40');
    });

    it('returns REMAINDER when the base group belongs to no section', () => {
      expect(
        sectionForBirthYear(1985, 2027, [
          section('AGE_24_40', 'BASE_GROUP', 0),
        ]),
      ).toBe('REMAINDER');
    });

    it('returns NO_BIRTH_YEAR for a null or future birth year', () => {
      expect(sectionForBirthYear(null, 2027, sections)).toBe('NO_BIRTH_YEAR');
      expect(sectionForBirthYear(2030, 2027, sections)).toBe('NO_BIRTH_YEAR');
    });

    it('prefers a preset over a base section covering the same group', () => {
      expect(
        sectionForBirthYear(2006, 2027, [
          section('AGE_21_23', 'BASE_GROUP', 0),
          section('PRESET_JUNIOR_UNDER_24', 'PRESET', 1),
        ]),
      ).toBe('PRESET_JUNIOR_UNDER_24');
    });

    it('returns REMAINDER when no section is configured', () => {
      expect(sectionForBirthYear(2006, 2027, [])).toBe('REMAINDER');
    });
  });

  describe('groupIdsInSection', () => {
    it('returns the single group of a base section', () => {
      expect(
        groupIdsInSection({
          sectionId: 'AGE_51_60',
          sectionKind: 'BASE_GROUP',
        }),
      ).toEqual(['AGE_51_60']);
    });

    it('returns the member groups of a preset section', () => {
      expect(
        groupIdsInSection({
          sectionId: 'PRESET_MASTERS_41_PLUS',
          sectionKind: 'PRESET',
        }),
      ).toEqual(['AGE_41_50', 'AGE_51_60', 'AGE_61_PLUS']);
    });
  });

  describe('sectionTitle', () => {
    it.each([
      ['AGE_61_PLUS', 'M', 'Мастер 3 (61+)'],
      ['AGE_19_20', 'M', 'Юниоры (19–20)'],
      ['AGE_LE_14', 'M', 'Юноши младшего возраста (≤14)'],
      ['AGE_61_PLUS', 'F', 'Мастер 3 (61+)'],
      ['AGE_19_20', 'F', 'Юниорки (19–20)'],
      ['AGE_LE_14', 'F', 'Девушки младшего возраста (≤14)'],
      ['AGE_24_40', 'F', 'Женщины (24–40)'],
    ] as const)(
      'titles base group %s for gender %s as %s',
      (sectionId, gender, expected) => {
        expect(
          sectionTitle({ sectionId, sectionKind: 'BASE_GROUP' }, gender),
        ).toBe(expected);
      },
    );

    it('titles a preset section after the preset', () => {
      expect(
        sectionTitle(
          { sectionId: 'PRESET_JUNIOR_UNDER_24', sectionKind: 'PRESET' },
          'F',
        ),
      ).toBe('Юниоры и младше (<24)');
      expect(
        sectionTitle(
          { sectionId: 'PRESET_MASTERS_41_PLUS', sectionKind: 'PRESET' },
          'M',
        ),
      ).toBe('Мастера 41+');
    });

    it('titles the implicit sections with their constants', () => {
      expect(
        sectionTitle(
          { sectionId: 'REMAINDER', sectionKind: 'BASE_GROUP' },
          'M',
        ),
      ).toBe(REMAINDER_TITLE);
      expect(
        sectionTitle(
          { sectionId: 'NO_BIRTH_YEAR', sectionKind: 'BASE_GROUP' },
          'F',
        ),
      ).toBe(NO_BIRTH_YEAR_TITLE);
      expect(REMAINDER_TITLE).toBe('Остальные участники');
      expect(NO_BIRTH_YEAR_TITLE).toBe('Возраст не указан');
    });
  });

  describe('orderSections', () => {
    it('orders configured sections by youngest bound', () => {
      const ordered = orderSections([
        section('AGE_61_PLUS', 'BASE_GROUP', 0),
        section('PRESET_JUNIOR_UNDER_24', 'PRESET', 1),
        section('AGE_15_16', 'BASE_GROUP', 2),
        section('AGE_41_50', 'BASE_GROUP', 3),
      ]);
      expect(ordered.map((item) => item.sectionId)).toEqual([
        'PRESET_JUNIOR_UNDER_24',
        'AGE_15_16',
        'AGE_41_50',
        'AGE_61_PLUS',
      ]);
    });

    it('keeps REMAINDER before NO_BIRTH_YEAR after every group section', () => {
      const ordered = orderSections([
        section('NO_BIRTH_YEAR', 'BASE_GROUP', 0),
        section('REMAINDER', 'BASE_GROUP', 1),
        section('AGE_41_50', 'BASE_GROUP', 2),
      ]);
      expect(ordered.map((item) => item.sectionId)).toEqual([
        'AGE_41_50',
        'REMAINDER',
        'NO_BIRTH_YEAR',
      ]);
    });

    it('breaks a youngest-bound tie by sort order', () => {
      const ordered = orderSections([
        section('REMAINDER', 'BASE_GROUP', 2),
        section('NO_BIRTH_YEAR', 'BASE_GROUP', 2),
        section('AGE_15_16', 'BASE_GROUP', 1),
        section('AGE_15_16', 'BASE_GROUP', 0),
      ]);
      expect(
        ordered.map((item) => `${item.sectionId}:${item.sortOrder}`),
      ).toEqual([
        'AGE_15_16:0',
        'AGE_15_16:1',
        'REMAINDER:2',
        'NO_BIRTH_YEAR:2',
      ]);
    });

    it('does not mutate the input array', () => {
      const sections: StoredAgeSection[] = [
        section('AGE_61_PLUS', 'BASE_GROUP', 0),
        section('AGE_LE_14', 'BASE_GROUP', 1),
      ];
      orderSections(sections);
      expect(sections.map((item) => item.sectionId)).toEqual([
        'AGE_61_PLUS',
        'AGE_LE_14',
      ]);
    });
  });

  describe('category headings', () => {
    it('derives the section id from the category number', () => {
      expect(categorySectionId(1)).toBe('CATEGORY_1');
      expect(categorySectionId(9)).toBe('CATEGORY_9');
      const sectionId: AgeCategorySectionId = categorySectionId(4);
      expect(sectionId).toBe('CATEGORY_4');
    });

    it('builds the primary heading from the shared prefix', () => {
      expect(CATEGORY_TITLE_PREFIX).toBe('Категория');
      expect(categoryTitle(1)).toBe('Категория 1');
      expect(categoryTitle(9)).toBe('Категория 9');
    });

    it('lists the member display ranges in catalog order', () => {
      expect(categorySubtitle(['AGE_15_16'])).toBe('15–16');
      expect(categorySubtitle(['AGE_17_18', 'AGE_15_16'])).toBe('15–16, 17–18');
      expect(categorySubtitle(['AGE_41_50', 'AGE_61_PLUS', 'AGE_51_60'])).toBe(
        '41–50, 51–60, 61+',
      );
    });

    it('returns an empty subtitle for an empty category', () => {
      expect(categorySubtitle([])).toBe('');
    });

    it('uses the smallest member bound as the category bound', () => {
      expect(categoryYoungestBound(['AGE_15_16', 'AGE_17_18'])).toBe(15);
      expect(categoryYoungestBound(['AGE_61_PLUS', 'AGE_24_40'])).toBe(24);
      expect(categoryYoungestBound([])).toBe(Number.POSITIVE_INFINITY);
    });
  });

  describe('normalizeAgeCategories', () => {
    it('drops empty and unknown categories and renumbers in input order', () => {
      expect(
        normalizeAgeCategories([
          { groupIds: ['AGE_15_16', 'AGE_15_16'] },
          { groupIds: [] },
          { groupIds: ['UNKNOWN_GROUP'] },
          { groupIds: ['AGE_17_18', 'AGE_19_20'] },
        ]),
      ).toEqual([
        { number: 1, groupIds: ['AGE_15_16'] },
        { number: 2, groupIds: ['AGE_17_18', 'AGE_19_20'] },
      ]);
    });

    it('keeps a base group in its first category only', () => {
      expect(
        normalizeAgeCategories([
          { groupIds: ['AGE_15_16'] },
          { groupIds: ['AGE_15_16', 'AGE_17_18'] },
          { groupIds: ['AGE_15_16'] },
        ]),
      ).toEqual([
        { number: 1, groupIds: ['AGE_15_16'] },
        { number: 2, groupIds: ['AGE_17_18'] },
      ]);
    });

    it('returns no category for an empty input', () => {
      expect(normalizeAgeCategories([])).toEqual([]);
    });
  });

  describe('categoriesFromStoredRows', () => {
    it('groups the rows by number and orders groups by age', () => {
      expect(
        categoriesFromStoredRows([
          { categoryNumber: 2, groupId: 'AGE_17_18' },
          { categoryNumber: 1, groupId: 'AGE_24_40' },
          { categoryNumber: 2, groupId: 'AGE_15_16' },
        ]),
      ).toEqual([
        { number: 1, groupIds: ['AGE_24_40'] },
        { number: 2, groupIds: ['AGE_15_16', 'AGE_17_18'] },
      ]);
    });

    it('renumbers a stored set with gaps to 1..N', () => {
      expect(
        categoriesFromStoredRows([
          { categoryNumber: 5, groupId: 'AGE_17_18' },
          { categoryNumber: 3, groupId: 'AGE_15_16' },
        ]),
      ).toEqual([
        { number: 1, groupIds: ['AGE_15_16'] },
        { number: 2, groupIds: ['AGE_17_18'] },
      ]);
    });

    it('ignores rows with an unknown group id', () => {
      expect(
        categoriesFromStoredRows([
          { categoryNumber: 1, groupId: 'AGE_15_16' },
          { categoryNumber: 2, groupId: 'UNKNOWN_GROUP' },
        ]),
      ).toEqual([{ number: 1, groupIds: ['AGE_15_16'] }]);
      expect(
        categoriesFromStoredRows([{ categoryNumber: 1, groupId: 'UNKNOWN' }]),
      ).toEqual([]);
    });
  });

  describe('convertLegacySections', () => {
    it('reads a base-group row as a one-group category', () => {
      expect(
        convertLegacySections([
          { sectionId: 'AGE_24_40', sectionKind: 'BASE_GROUP', sortOrder: 0 },
        ]),
      ).toEqual([{ number: 1, groupIds: ['AGE_24_40'] }]);
    });

    it('reads a preset row as its member groups', () => {
      expect(
        convertLegacySections([
          {
            sectionId: 'PRESET_MASTERS_41_PLUS',
            sectionKind: 'PRESET',
            sortOrder: 0,
          },
        ]),
      ).toEqual([
        { number: 1, groupIds: ['AGE_41_50', 'AGE_51_60', 'AGE_61_PLUS'] },
      ]);
      expect(
        convertLegacySections([
          {
            sectionId: 'PRESET_JUNIOR_UNDER_24',
            sectionKind: 'PRESET',
            sortOrder: 0,
          },
        ]),
      ).toEqual([
        {
          number: 1,
          groupIds: [
            'AGE_LE_14',
            'AGE_15_16',
            'AGE_17_18',
            'AGE_19_20',
            'AGE_21_23',
          ],
        },
      ]);
    });

    it('reads the rows in ascending sort order', () => {
      expect(
        convertLegacySections([
          { sectionId: 'AGE_15_16', sectionKind: 'BASE_GROUP', sortOrder: 2 },
          { sectionId: 'AGE_24_40', sectionKind: 'BASE_GROUP', sortOrder: 1 },
          {
            sectionId: 'PRESET_MASTERS_41_PLUS',
            sectionKind: 'PRESET',
            sortOrder: 0,
          },
        ]),
      ).toEqual([
        { number: 1, groupIds: ['AGE_41_50', 'AGE_51_60', 'AGE_61_PLUS'] },
        { number: 2, groupIds: ['AGE_24_40'] },
        { number: 3, groupIds: ['AGE_15_16'] },
      ]);
    });

    it('ignores unknown ids and unknown kinds', () => {
      expect(
        convertLegacySections([
          { sectionId: 'UNKNOWN', sectionKind: 'BASE_GROUP', sortOrder: 0 },
          { sectionId: 'AGE_15_16', sectionKind: 'UNKNOWN_KIND', sortOrder: 1 },
          {
            sectionId: 'PRESET_ALL_GROUPS',
            sectionKind: 'PRESET',
            sortOrder: 2,
          },
        ]),
      ).toEqual([]);
      expect(convertLegacySections([])).toEqual([]);
    });
  });

  describe('orderCategoriesByAge', () => {
    it('orders categories youngest-first with multi-group categories', () => {
      const categories: AgeCategory[] = [
        { number: 1, groupIds: ['AGE_41_50', 'AGE_51_60', 'AGE_61_PLUS'] },
        { number: 2, groupIds: ['AGE_15_16', 'AGE_17_18'] },
        { number: 3, groupIds: ['AGE_24_40'] },
      ];
      expect(
        orderCategoriesByAge(categories).map((item) => item.number),
      ).toEqual([2, 3, 1]);
    });

    it('keeps the input order on equal youngest bounds', () => {
      const categories: AgeCategory[] = [
        { number: 1, groupIds: ['AGE_15_16', 'AGE_19_20'] },
        { number: 2, groupIds: ['AGE_15_16', 'AGE_17_18'] },
      ];
      expect(
        orderCategoriesByAge(categories).map((item) => item.number),
      ).toEqual([1, 2]);
    });

    it('does not mutate the input array', () => {
      const categories: AgeCategory[] = [
        { number: 1, groupIds: ['AGE_61_PLUS'] },
        { number: 2, groupIds: ['AGE_LE_14'] },
      ];
      orderCategoriesByAge(categories);
      expect(categories.map((item) => item.number)).toEqual([1, 2]);
    });
  });

  describe('categoryForBirthYear', () => {
    const categories: AgeCategory[] = [
      {
        number: 1,
        groupIds: [
          'AGE_LE_14',
          'AGE_15_16',
          'AGE_17_18',
          'AGE_19_20',
          'AGE_21_23',
        ],
      },
      { number: 2, groupIds: ['AGE_24_40', 'AGE_41_50'] },
    ];

    it('returns the category that contains the base group', () => {
      expect(categoryForBirthYear(2006, 2027, categories)).toBe('CATEGORY_1');
      expect(categoryForBirthYear(2003, 2027, categories)).toBe('CATEGORY_2');
      expect(categoryForBirthYear(1985, 2027, categories)).toBe('CATEGORY_2');
    });

    it('returns REMAINDER for a group outside every category', () => {
      expect(categoryForBirthYear(1960, 2027, categories)).toBe('REMAINDER');
      expect(categoryForBirthYear(2006, 2027, [])).toBe('REMAINDER');
    });

    it('returns NO_BIRTH_YEAR for a null or future birth year', () => {
      expect(categoryForBirthYear(null, 2027, categories)).toBe(
        'NO_BIRTH_YEAR',
      );
      expect(categoryForBirthYear(2030, 2027, categories)).toBe(
        'NO_BIRTH_YEAR',
      );
    });
  });

  describe('type guards', () => {
    it('recognizes the nine base group ids', () => {
      expect(isAgeGroupId('AGE_LE_14')).toBe(true);
      expect(isAgeGroupId('PRESET_JUNIOR_UNDER_24')).toBe(false);
      expect(isAgeGroupId('REMAINDER')).toBe(false);
      expect(AGE_GROUPS.every((group) => isAgeGroupId(group.id))).toBe(true);
    });

    it('recognizes the two stored presets only', () => {
      expect(isAgePresetId('PRESET_JUNIOR_UNDER_24')).toBe(true);
      expect(isAgePresetId('PRESET_MASTERS_41_PLUS')).toBe(true);
      expect(isAgePresetId('PRESET_ALL_GROUPS')).toBe(false);
      expect(isAgePresetId('AGE_LE_14')).toBe(false);
    });

    it('recognizes stored section ids as base groups or presets', () => {
      expect(isStoredSectionId('AGE_21_23')).toBe(true);
      expect(isStoredSectionId('PRESET_MASTERS_41_PLUS')).toBe(true);
      expect(isStoredSectionId('REMAINDER')).toBe(false);
      expect(isStoredSectionId('NO_BIRTH_YEAR')).toBe(false);
      expect(isStoredSectionId('PRESET_ALL_GROUPS')).toBe(false);
      const ids: AgeGroupId[] = AGE_GROUPS.map((group) => group.id);
      expect(ids.every((id) => isStoredSectionId(id))).toBe(true);
    });
  });
});
