import { BadRequestException } from '@nestjs/common';
import { parseSetAgeSplitBody } from './parse-set-age-split';

const START_ID = '11111111-1111-4111-8111-111111111111';

const validBody = (overrides: Record<string, unknown> = {}) => ({
  gender: 'M',
  startId: START_ID,
  formatId: 1,
  enabled: true,
  selections: [{ kind: 'BASE_GROUP', id: 'AGE_41_50' }],
  ...overrides,
});

describe('parseSetAgeSplitBody', () => {
  it('parses an enabled body', () => {
    const parsed = parseSetAgeSplitBody(
      validBody({
        gender: 'F',
        formatId: 3,
        selections: [
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
      selections: [
        { kind: 'BASE_GROUP', id: 'AGE_51_60' },
        { kind: 'PRESET', id: 'PRESET_JUNIOR_UNDER_24' },
      ],
    });
  });

  it('parses a disabled body with no sections', () => {
    const parsed = parseSetAgeSplitBody(
      validBody({ enabled: false, selections: [] }),
    );

    expect(parsed).toEqual({
      gender: 'M',
      startId: START_ID,
      formatId: 1,
      enabled: false,
      selections: [],
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
        selections: ids.map((id) => ({ kind: 'BASE_GROUP', id })),
      }),
    );

    expect(parsed.selections).toHaveLength(9);
    expect(parsed.selections.map((section) => section.id)).toEqual(ids);
  });

  it('accepts PRESET_ALL_GROUPS in a request', () => {
    const parsed = parseSetAgeSplitBody(
      validBody({ selections: [{ kind: 'PRESET', id: 'PRESET_ALL_GROUPS' }] }),
    );

    expect(parsed.selections).toEqual([
      { kind: 'PRESET', id: 'PRESET_ALL_GROUPS' },
    ]);
  });

  it('accepts a preset together with a base group it absorbs', () => {
    const parsed = parseSetAgeSplitBody(
      validBody({
        selections: [
          { kind: 'BASE_GROUP', id: 'AGE_15_16' },
          { kind: 'PRESET', id: 'PRESET_JUNIOR_UNDER_24' },
        ],
      }),
    );

    expect(parsed.selections).toEqual([
      { kind: 'BASE_GROUP', id: 'AGE_15_16' },
      { kind: 'PRESET', id: 'PRESET_JUNIOR_UNDER_24' },
    ]);
  });

  it('ignores unknown extra properties', () => {
    const parsed = parseSetAgeSplitBody({
      ...validBody(),
      eventId: '22222222-2222-4222-8222-222222222222',
      createdAt: '2026-11-10T00:00:00.000Z',
      sections: [{ kind: 'BASE_GROUP', id: 'AGE_LE_14' }],
    });

    expect(parsed).toEqual({
      gender: 'M',
      startId: START_ID,
      formatId: 1,
      enabled: true,
      selections: [{ kind: 'BASE_GROUP', id: 'AGE_41_50' }],
    });
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['a string', 'selections'],
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
    ['missing selections', { selections: undefined }],
    ['null selections', { selections: null }],
    ['non-array selections', { selections: 'AGE_41_50' }],
  ])('rejects %s', (_label, overrides) => {
    expect(() => parseSetAgeSplitBody(validBody(overrides))).toThrow(
      BadRequestException,
    );
  });

  it('rejects a non-object selection item', () => {
    expect(() =>
      parseSetAgeSplitBody(validBody({ selections: [null] })),
    ).toThrow(BadRequestException);
    expect(() => parseSetAgeSplitBody(validBody({ selections: [[]] }))).toThrow(
      BadRequestException,
    );
    expect(() =>
      parseSetAgeSplitBody(validBody({ selections: ['AGE_41_50'] })),
    ).toThrow(BadRequestException);
  });

  it('rejects an unknown selection kind', () => {
    expect(() =>
      parseSetAgeSplitBody(
        validBody({ selections: [{ kind: 'GROUP', id: 'AGE_41_50' }] }),
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      parseSetAgeSplitBody(validBody({ selections: [{ id: 'AGE_41_50' }] })),
    ).toThrow(BadRequestException);
  });

  it('rejects an unknown group id', () => {
    expect(() =>
      parseSetAgeSplitBody(
        validBody({ selections: [{ kind: 'BASE_GROUP', id: 'AGE_99_100' }] }),
      ),
    ).toThrow('неизвестную возрастную группу');
    expect(() =>
      parseSetAgeSplitBody(
        validBody({ selections: [{ kind: 'BASE_GROUP', id: 'AGE_19_21' }] }),
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects a preset id used as a base group', () => {
    expect(() =>
      parseSetAgeSplitBody(
        validBody({
          selections: [{ kind: 'BASE_GROUP', id: 'PRESET_MASTERS_41_PLUS' }],
        }),
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects an unknown preset id', () => {
    expect(() =>
      parseSetAgeSplitBody(
        validBody({ selections: [{ kind: 'PRESET', id: 'PRESET_TEENS' }] }),
      ),
    ).toThrow('неизвестный пресет');
  });

  it('rejects a base group id used as a preset', () => {
    expect(() =>
      parseSetAgeSplitBody(
        validBody({ selections: [{ kind: 'PRESET', id: 'AGE_41_50' }] }),
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects a missing selection id', () => {
    expect(() =>
      parseSetAgeSplitBody(validBody({ selections: [{ kind: 'BASE_GROUP' }] })),
    ).toThrow(BadRequestException);
  });

  it('rejects an exact duplicate selection pair', () => {
    expect(() =>
      parseSetAgeSplitBody(
        validBody({
          selections: [
            { kind: 'BASE_GROUP', id: 'AGE_41_50' },
            { kind: 'BASE_GROUP', id: 'AGE_41_50' },
          ],
        }),
      ),
    ).toThrow('указана дважды');
    expect(() =>
      parseSetAgeSplitBody(
        validBody({
          selections: [
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
          selections: [{ kind: 'BASE_GROUP', id: 'AGE_41_50' }],
        }),
      ),
    ).toThrow('selections должен быть пустым');
  });

  it('rejects an enabled split without sections', () => {
    expect(() =>
      parseSetAgeSplitBody(validBody({ enabled: true, selections: [] })),
    ).toThrow('нужна хотя бы одна секция');
  });
});
