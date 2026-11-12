import { BadRequestException } from '@nestjs/common';
import {
  parseSetAgeCategoriesBody,
  parseSetAgeSplitBody,
} from './parse-set-age-split';

const START_ID = '11111111-1111-4111-8111-111111111111';

const validBody = (overrides: Record<string, unknown> = {}) => ({
  gender: 'M',
  startId: START_ID,
  formatId: 1,
  enabled: true,
  sections: [{ kind: 'BASE_GROUP', id: 'AGE_41_50' }],
  ...overrides,
});

describe('parseSetAgeSplitBody', () => {
  it('parses an enabled body', () => {
    const parsed = parseSetAgeSplitBody(
      validBody({
        gender: 'F',
        formatId: 3,
        sections: [
          { kind: 'BASE_GROUP', id: 'AGE_51_60' },
          { kind: 'PRESET', id: 'PRESET_JUNIOR_UNDER_24' },
        ],
      }),
    );

    expect(parsed).toEqual({
      gender: 'F',
      startId: START_ID,
      formatId: 3,
      enabled: true,
      sections: [
        { kind: 'BASE_GROUP', id: 'AGE_51_60' },
        { kind: 'PRESET', id: 'PRESET_JUNIOR_UNDER_24' },
      ],
    });
  });

  it('parses a disabled body with no sections', () => {
    const parsed = parseSetAgeSplitBody(
      validBody({ enabled: false, sections: [] }),
    );

    expect(parsed).toEqual({
      gender: 'M',
      startId: START_ID,
      formatId: 1,
      enabled: false,
      sections: [],
    });
  });

  it('accepts all nine base group ids', () => {
    const ids = [
      'AGE_LE_14',
      'AGE_15_16',
      'AGE_17_18',
      'AGE_19_20',
      'AGE_21_23',
      'AGE_24_40',
      'AGE_41_50',
      'AGE_51_60',
      'AGE_61_PLUS',
    ];
    const parsed = parseSetAgeSplitBody(
      validBody({
        sections: ids.map((id) => ({ kind: 'BASE_GROUP', id })),
      }),
    );

    expect(parsed.sections).toHaveLength(9);
    expect(parsed.sections.map((section) => section.id)).toEqual(ids);
  });

  it('accepts PRESET_ALL_GROUPS in a request', () => {
    const parsed = parseSetAgeSplitBody(
      validBody({ sections: [{ kind: 'PRESET', id: 'PRESET_ALL_GROUPS' }] }),
    );

    expect(parsed.sections).toEqual([
      { kind: 'PRESET', id: 'PRESET_ALL_GROUPS' },
    ]);
  });

  it('accepts a preset together with a base group it absorbs', () => {
    const parsed = parseSetAgeSplitBody(
      validBody({
        sections: [
          { kind: 'BASE_GROUP', id: 'AGE_15_16' },
          { kind: 'PRESET', id: 'PRESET_JUNIOR_UNDER_24' },
        ],
      }),
    );

    expect(parsed.sections).toEqual([
      { kind: 'BASE_GROUP', id: 'AGE_15_16' },
      { kind: 'PRESET', id: 'PRESET_JUNIOR_UNDER_24' },
    ]);
  });

  it('ignores unknown extra properties', () => {
    const parsed = parseSetAgeSplitBody({
      ...validBody(),
      eventId: '22222222-2222-4222-8222-222222222222',
      createdAt: '2026-11-10T00:00:00.000Z',
      ageSections: [{ kind: 'BASE_GROUP', id: 'AGE_LE_14' }],
    });

    expect(parsed).toEqual({
      gender: 'M',
      startId: START_ID,
      formatId: 1,
      enabled: true,
      sections: [{ kind: 'BASE_GROUP', id: 'AGE_41_50' }],
    });
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['a string', 'sections'],
    ['undefined', undefined],
  ])('rejects a body that is %s', (_label, body) => {
    expect(() => parseSetAgeSplitBody(body)).toThrow(BadRequestException);
  });

  it.each([
    ['an unknown gender', { gender: 'X' }],
    ['a missing gender', { gender: undefined }],
    ['a non-UUID startId', { startId: 'not-a-uuid' }],
    ['a startId without dashes', { startId: START_ID.replace(/-/g, '') }],
    ['a missing startId', { startId: undefined }],
    ['formatId 0', { formatId: 0 }],
    ['a negative formatId', { formatId: -1 }],
    ['a fractional formatId', { formatId: 1.5 }],
    ['a string formatId', { formatId: '1' }],
    ['a missing formatId', { formatId: undefined }],
    ['a non-boolean enabled', { enabled: 'true' }],
    ['a numeric enabled', { enabled: 1 }],
    ['a missing enabled', { enabled: undefined }],
    ['missing sections', { sections: undefined }],
    ['null sections', { sections: null }],
    ['non-array sections', { sections: 'AGE_41_50' }],
  ])('rejects %s', (_label, overrides) => {
    expect(() => parseSetAgeSplitBody(validBody(overrides))).toThrow(
      BadRequestException,
    );
  });

  it('rejects a non-object selection item', () => {
    expect(() => parseSetAgeSplitBody(validBody({ sections: [null] }))).toThrow(
      BadRequestException,
    );
    expect(() => parseSetAgeSplitBody(validBody({ sections: [[]] }))).toThrow(
      BadRequestException,
    );
    expect(() =>
      parseSetAgeSplitBody(validBody({ sections: ['AGE_41_50'] })),
    ).toThrow(BadRequestException);
  });

  it('rejects an unknown selection kind', () => {
    expect(() =>
      parseSetAgeSplitBody(
        validBody({ sections: [{ kind: 'GROUP', id: 'AGE_41_50' }] }),
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      parseSetAgeSplitBody(validBody({ sections: [{ id: 'AGE_41_50' }] })),
    ).toThrow(BadRequestException);
  });

  it('rejects an unknown group id', () => {
    expect(() =>
      parseSetAgeSplitBody(
        validBody({ sections: [{ kind: 'BASE_GROUP', id: 'AGE_99_100' }] }),
      ),
    ).toThrow('неизвестную возрастную группу');
    expect(() =>
      parseSetAgeSplitBody(
        validBody({ sections: [{ kind: 'BASE_GROUP', id: 'AGE_19_21' }] }),
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects a preset id used as a base group', () => {
    expect(() =>
      parseSetAgeSplitBody(
        validBody({
          sections: [{ kind: 'BASE_GROUP', id: 'PRESET_MASTERS_41_PLUS' }],
        }),
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects an unknown preset id', () => {
    expect(() =>
      parseSetAgeSplitBody(
        validBody({ sections: [{ kind: 'PRESET', id: 'PRESET_TEENS' }] }),
      ),
    ).toThrow('неизвестный пресет');
  });

  it('rejects a base group id used as a preset', () => {
    expect(() =>
      parseSetAgeSplitBody(
        validBody({ sections: [{ kind: 'PRESET', id: 'AGE_41_50' }] }),
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects a missing selection id', () => {
    expect(() =>
      parseSetAgeSplitBody(validBody({ sections: [{ kind: 'BASE_GROUP' }] })),
    ).toThrow(BadRequestException);
  });

  it('rejects an exact duplicate selection pair', () => {
    expect(() =>
      parseSetAgeSplitBody(
        validBody({
          sections: [
            { kind: 'BASE_GROUP', id: 'AGE_41_50' },
            { kind: 'BASE_GROUP', id: 'AGE_41_50' },
          ],
        }),
      ),
    ).toThrow('указана дважды');
    expect(() =>
      parseSetAgeSplitBody(
        validBody({
          sections: [
            { kind: 'PRESET', id: 'PRESET_MASTERS_41_PLUS' },
            { kind: 'PRESET', id: 'PRESET_MASTERS_41_PLUS' },
          ],
        }),
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects sections on a disabled split', () => {
    expect(() =>
      parseSetAgeSplitBody(
        validBody({
          enabled: false,
          sections: [{ kind: 'BASE_GROUP', id: 'AGE_41_50' }],
        }),
      ),
    ).toThrow('sections должен быть пустым');
  });

  it('rejects an enabled split without sections', () => {
    expect(() =>
      parseSetAgeSplitBody(validBody({ enabled: true, sections: [] })),
    ).toThrow('нужна хотя бы одна секция');
  });
});

const validCategoriesBody = (overrides: Record<string, unknown> = {}) => ({
  gender: 'M',
  startId: START_ID,
  formatId: 2,
  enabled: true,
  categories: [
    { groupIds: ['AGE_17_18', 'AGE_24_40'] },
    { groupIds: ['AGE_41_50'] },
  ],
  ...overrides,
});

describe('parseSetAgeCategoriesBody', () => {
  it('parses an enabled body with two categories', () => {
    const parsed = parseSetAgeCategoriesBody(
      validCategoriesBody({ gender: 'F', formatId: 3 }),
    );

    expect(parsed).toEqual({
      gender: 'F',
      startId: START_ID,
      formatId: 3,
      enabled: true,
      categories: [
        { groupIds: ['AGE_17_18', 'AGE_24_40'] },
        { groupIds: ['AGE_41_50'] },
      ],
    });
  });

  it('accepts a category with an empty groupIds list', () => {
    const parsed = parseSetAgeCategoriesBody(
      validCategoriesBody({
        categories: [
          { groupIds: [] },
          { groupIds: ['AGE_51_60', 'AGE_61_PLUS'] },
        ],
      }),
    );

    expect(parsed.categories).toEqual([
      { groupIds: [] },
      { groupIds: ['AGE_51_60', 'AGE_61_PLUS'] },
    ]);
  });

  it('parses a disabled body with empty categories', () => {
    const parsed = parseSetAgeCategoriesBody(
      validCategoriesBody({ enabled: false, categories: [] }),
    );

    expect(parsed).toEqual({
      gender: 'M',
      startId: START_ID,
      formatId: 2,
      enabled: false,
      categories: [],
    });
  });

  it('ignores unknown extra properties', () => {
    const parsed = parseSetAgeCategoriesBody({
      ...validCategoriesBody(),
      eventId: '22222222-2222-4222-8222-222222222222',
      createdAt: '2026-11-10T00:00:00.000Z',
    });

    expect(parsed).toEqual({
      gender: 'M',
      startId: START_ID,
      formatId: 2,
      enabled: true,
      categories: [
        { groupIds: ['AGE_17_18', 'AGE_24_40'] },
        { groupIds: ['AGE_41_50'] },
      ],
    });
  });

  it('rejects categories on a disabled configuration', () => {
    expect(() =>
      parseSetAgeCategoriesBody(
        validCategoriesBody({ enabled: false, categories: [{ groupIds: [] }] }),
      ),
    ).toThrow('categories должен быть пустым');
  });

  it('rejects the retired sections property, even when it is empty', () => {
    expect(() =>
      parseSetAgeCategoriesBody(
        validCategoriesBody({
          sections: [{ kind: 'BASE_GROUP', id: 'AGE_41_50' }],
        }),
      ),
    ).toThrow('categories');
    expect(() =>
      parseSetAgeCategoriesBody(
        validCategoriesBody({ sections: [], categories: [] }),
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects the retired kind discriminator', () => {
    expect(() =>
      parseSetAgeCategoriesBody(
        validCategoriesBody({
          categories: [{ kind: 'BASE_GROUP', groupIds: ['AGE_41_50'] }],
        }),
      ),
    ).toThrow('kind');
  });

  it('rejects a preset id as an unknown group', () => {
    expect(() =>
      parseSetAgeCategoriesBody(
        validCategoriesBody({
          categories: [{ groupIds: ['PRESET_MASTERS_41_PLUS'] }],
        }),
      ),
    ).toThrow('неизвестную возрастную группу');
  });

  it('rejects a group repeated inside one category', () => {
    expect(() =>
      parseSetAgeCategoriesBody(
        validCategoriesBody({
          categories: [{ groupIds: ['AGE_41_50', 'AGE_41_50'] }],
        }),
      ),
    ).toThrow('дважды');
  });

  it('rejects a group repeated across two categories', () => {
    expect(() =>
      parseSetAgeCategoriesBody(
        validCategoriesBody({
          categories: [
            { groupIds: ['AGE_41_50'] },
            { groupIds: ['AGE_41_50', 'AGE_51_60'] },
          ],
        }),
      ),
    ).toThrow('другую категорию');
  });

  it('rejects an unknown group id', () => {
    expect(() =>
      parseSetAgeCategoriesBody(
        validCategoriesBody({ categories: [{ groupIds: ['AGE_99_100'] }] }),
      ),
    ).toThrow('неизвестную возрастную группу');
  });

  it('rejects a non-string group id', () => {
    expect(() =>
      parseSetAgeCategoriesBody(
        validCategoriesBody({ categories: [{ groupIds: [42] }] }),
      ),
    ).toThrow('неизвестную возрастную группу');
  });

  it('rejects malformed category items', () => {
    expect(() =>
      parseSetAgeCategoriesBody(validCategoriesBody({ categories: [null] })),
    ).toThrow(BadRequestException);
    expect(() =>
      parseSetAgeCategoriesBody(validCategoriesBody({ categories: [[]] })),
    ).toThrow(BadRequestException);
    expect(() =>
      parseSetAgeCategoriesBody(
        validCategoriesBody({ categories: ['AGE_41_50'] }),
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects a category without a groupIds array', () => {
    expect(() =>
      parseSetAgeCategoriesBody(validCategoriesBody({ categories: [{}] })),
    ).toThrow('groupIds должен быть массивом');
    expect(() =>
      parseSetAgeCategoriesBody(
        validCategoriesBody({ categories: [{ groupIds: 'AGE_41_50' }] }),
      ),
    ).toThrow('groupIds должен быть массивом');
  });

  it.each([
    ['missing categories', { categories: undefined }],
    ['null categories', { categories: null }],
    ['non-array categories', { categories: 'AGE_41_50' }],
  ])('rejects %s', (_label, overrides) => {
    expect(() =>
      parseSetAgeCategoriesBody(validCategoriesBody(overrides)),
    ).toThrow(BadRequestException);
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['a string', 'categories'],
    ['undefined', undefined],
  ])('rejects a body that is %s', (_label, body) => {
    expect(() => parseSetAgeCategoriesBody(body)).toThrow(BadRequestException);
  });

  it.each([
    ['an unknown gender', { gender: 'X' }],
    ['a non-UUID startId', { startId: 'not-a-uuid' }],
    ['formatId 0', { formatId: 0 }],
    ['a fractional formatId', { formatId: 1.5 }],
    ['a non-boolean enabled', { enabled: 'true' }],
  ])('rejects %s', (_label, overrides) => {
    expect(() =>
      parseSetAgeCategoriesBody(validCategoriesBody(overrides)),
    ).toThrow(BadRequestException);
  });
});
