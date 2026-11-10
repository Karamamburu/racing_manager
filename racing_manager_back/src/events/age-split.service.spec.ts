import { BadRequestException } from '@nestjs/common';
import type { StoredAgeSection } from './age-groups';
import type {
  AgeSplitDb,
  AgeSplitKey,
  AgeSplitRepository,
} from './age-split.repository';
import {
  AgeSplitService,
  normalizeAgeSplitSections,
  type AgeSplitRef,
} from './age-split.service';
import type { ParsedAgeSplitSelection } from './parse-set-age-split';
import type { PrismaService } from '../prisma/prisma.service';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const START_ID = '22222222-2222-4222-8222-222222222222';

const SENTINEL_TX = { sentinel: 'transaction' };

type ReplaceCall = {
  db: unknown;
  key: AgeSplitKey;
  sections: StoredAgeSection[];
};

type HarnessOptions = {
  categoryExists?: boolean;
};

function makeHarness(options: HarnessOptions = {}) {
  const replaceCalls: ReplaceCall[] = [];
  const repository = {
    categoryExists: jest.fn(() =>
      Promise.resolve(options.categoryExists ?? true),
    ),
    replace: jest.fn(
      (
        db: AgeSplitDb,
        key: AgeSplitKey,
        sections: readonly StoredAgeSection[],
      ) => {
        replaceCalls.push({ db, key, sections: [...sections] });
        return Promise.resolve();
      },
    ),
    findByEvent: jest.fn(() => Promise.resolve([])),
  };
  const transaction = jest.fn(
    (work: (client: typeof SENTINEL_TX) => Promise<unknown>) =>
      work(SENTINEL_TX),
  );
  const prisma = { $transaction: transaction };
  const service = new AgeSplitService(
    prisma as unknown as PrismaService,
    repository as unknown as AgeSplitRepository,
  );

  return { service, repository, replaceCalls, transaction };
}

function body(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    gender: 'M',
    startId: START_ID,
    formatId: 1,
    enabled: true,
    sections: [{ kind: 'BASE_GROUP', id: 'AGE_41_50' }],
    ...overrides,
  };
}

function selection(
  kind: ParsedAgeSplitSelection['kind'],
  id: string,
): ParsedAgeSplitSelection {
  return { kind, id };
}

describe('normalizeAgeSplitSections', () => {
  it('orders individual groups by age and renumbers sort order from zero', () => {
    const sections = normalizeAgeSplitSections([
      selection('BASE_GROUP', 'AGE_61_PLUS'),
      selection('BASE_GROUP', 'AGE_41_50'),
      selection('BASE_GROUP', 'AGE_15_16'),
    ]);

    expect(sections).toEqual([
      { sectionId: 'AGE_15_16', sectionKind: 'BASE_GROUP', sortOrder: 0 },
      { sectionId: 'AGE_41_50', sectionKind: 'BASE_GROUP', sortOrder: 1 },
      { sectionId: 'AGE_61_PLUS', sectionKind: 'BASE_GROUP', sortOrder: 2 },
    ]);
  });

  it('expands a preset into one combined section', () => {
    const sections = normalizeAgeSplitSections([
      selection('PRESET', 'PRESET_JUNIOR_UNDER_24'),
    ]);

    expect(sections).toEqual([
      {
        sectionId: 'PRESET_JUNIOR_UNDER_24',
        sectionKind: 'PRESET',
        sortOrder: 0,
      },
    ]);
  });

  it('absorbs a base group already covered by a selected preset', () => {
    const sections = normalizeAgeSplitSections([
      selection('BASE_GROUP', 'AGE_15_16'),
      selection('PRESET', 'PRESET_JUNIOR_UNDER_24'),
      selection('BASE_GROUP', 'AGE_41_50'),
    ]);

    expect(sections).toEqual([
      {
        sectionId: 'PRESET_JUNIOR_UNDER_24',
        sectionKind: 'PRESET',
        sortOrder: 0,
      },
      { sectionId: 'AGE_41_50', sectionKind: 'BASE_GROUP', sortOrder: 1 },
    ]);
  });

  it('keeps two presets side by side ordered by youngest bound', () => {
    const sections = normalizeAgeSplitSections([
      selection('PRESET', 'PRESET_MASTERS_41_PLUS'),
      selection('PRESET', 'PRESET_JUNIOR_UNDER_24'),
      selection('BASE_GROUP', 'AGE_61_PLUS'),
      selection('BASE_GROUP', 'AGE_24_40'),
    ]);

    expect(sections).toEqual([
      {
        sectionId: 'PRESET_JUNIOR_UNDER_24',
        sectionKind: 'PRESET',
        sortOrder: 0,
      },
      { sectionId: 'AGE_24_40', sectionKind: 'BASE_GROUP', sortOrder: 1 },
      {
        sectionId: 'PRESET_MASTERS_41_PLUS',
        sectionKind: 'PRESET',
        sortOrder: 2,
      },
    ]);
  });

  it('replaces the whole set with nine base sections for PRESET_ALL_GROUPS', () => {
    const sections = normalizeAgeSplitSections([
      selection('BASE_GROUP', 'AGE_41_50'),
      selection('PRESET', 'PRESET_ALL_GROUPS'),
      selection('PRESET', 'PRESET_JUNIOR_UNDER_24'),
    ]);

    expect(sections.map((section) => section.sectionId)).toEqual([
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
    expect(sections.map((section) => section.sortOrder)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(
      sections.every((section) => section.sectionKind === 'BASE_GROUP'),
    ).toBe(true);
  });
});

describe('AgeSplitService.setSplit', () => {
  it('stores ordered sections for individual groups and returns them renumbered', async () => {
    const { service, replaceCalls, transaction } = makeHarness();

    const result = await service.setSplit(
      EVENT_ID,
      body({
        sections: [
          { kind: 'BASE_GROUP', id: 'AGE_61_PLUS' },
          { kind: 'BASE_GROUP', id: 'AGE_51_60' },
        ],
      }),
    );

    expect(result).toEqual<AgeSplitRef>({
      startId: START_ID,
      formatId: 1,
      gender: 'M',
      enabled: true,
      sections: [
        { id: 'AGE_51_60', kind: 'BASE_GROUP', title: 'Мастер 2 (51–60)' },
        { id: 'AGE_61_PLUS', kind: 'BASE_GROUP', title: 'Мастер 3 (61+)' },
      ],
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(replaceCalls).toHaveLength(1);
    expect(replaceCalls[0].db).toBe(SENTINEL_TX);
    expect(replaceCalls[0].key).toEqual({
      eventId: EVENT_ID,
      startId: START_ID,
      formatId: 1,
      gender: 'M',
    });
    expect(replaceCalls[0].sections).toEqual([
      { sectionId: 'AGE_51_60', sectionKind: 'BASE_GROUP', sortOrder: 0 },
      { sectionId: 'AGE_61_PLUS', sectionKind: 'BASE_GROUP', sortOrder: 1 },
    ]);
  });

  it('stores one combined section for the junior preset', async () => {
    const { service, replaceCalls } = makeHarness();

    const result = await service.setSplit(
      EVENT_ID,
      body({
        sections: [
          { kind: 'BASE_GROUP', id: 'AGE_17_18' },
          { kind: 'PRESET', id: 'PRESET_JUNIOR_UNDER_24' },
        ],
      }),
    );

    expect(result.sections).toEqual([
      {
        id: 'PRESET_JUNIOR_UNDER_24',
        kind: 'PRESET',
        title: 'Юниоры и младше (<24)',
      },
    ]);
    expect(replaceCalls[0].sections).toEqual([
      {
        sectionId: 'PRESET_JUNIOR_UNDER_24',
        sectionKind: 'PRESET',
        sortOrder: 0,
      },
    ]);
  });

  it('stores two presets together', async () => {
    const { service, replaceCalls } = makeHarness();

    const result = await service.setSplit(
      EVENT_ID,
      body({
        sections: [
          { kind: 'PRESET', id: 'PRESET_MASTERS_41_PLUS' },
          { kind: 'PRESET', id: 'PRESET_JUNIOR_UNDER_24' },
        ],
      }),
    );

    expect(result.sections.map((section) => section.id)).toEqual([
      'PRESET_JUNIOR_UNDER_24',
      'PRESET_MASTERS_41_PLUS',
    ]);
    expect(
      replaceCalls[0].sections.map((section) => section.sortOrder),
    ).toEqual([0, 1]);
  });

  it('stores the nine base sections for PRESET_ALL_GROUPS and ignores other sections', async () => {
    const { service, replaceCalls } = makeHarness();

    const result = await service.setSplit(
      EVENT_ID,
      body({
        sections: [
          { kind: 'PRESET', id: 'PRESET_MASTERS_41_PLUS' },
          { kind: 'BASE_GROUP', id: 'AGE_LE_14' },
          { kind: 'PRESET', id: 'PRESET_ALL_GROUPS' },
        ],
      }),
    );

    expect(result.sections).toHaveLength(9);
    expect(
      result.sections.every((section) => section.kind === 'BASE_GROUP'),
    ).toBe(true);
    expect(result.sections[0]).toEqual({
      id: 'AGE_LE_14',
      kind: 'BASE_GROUP',
      title: 'Юноши младшего возраста (≤14)',
    });
    expect(
      replaceCalls[0].sections.map((section) => section.sectionId),
    ).toEqual([
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

  it('titles base sections for the requested gender', async () => {
    const { service } = makeHarness();

    const male = await service.setSplit(
      EVENT_ID,
      body({
        gender: 'M',
        sections: [{ kind: 'BASE_GROUP', id: 'AGE_24_40' }],
      }),
    );
    const female = await service.setSplit(
      EVENT_ID,
      body({
        gender: 'F',
        sections: [{ kind: 'BASE_GROUP', id: 'AGE_24_40' }],
      }),
    );

    expect(male.sections[0].title).toBe('Мужчины (24–40)');
    expect(female.sections[0].title).toBe('Женщины (24–40)');
  });

  it('clears the category rows and returns a disabled empty split', async () => {
    const { service, replaceCalls, repository } = makeHarness({
      categoryExists: false,
    });

    const result = await service.setSplit(
      EVENT_ID,
      body({ enabled: false, sections: [] }),
    );

    expect(result).toEqual<AgeSplitRef>({
      startId: START_ID,
      formatId: 1,
      gender: 'M',
      enabled: false,
      sections: [],
    });
    expect(replaceCalls).toHaveLength(1);
    expect(replaceCalls[0].db).toBe(SENTINEL_TX);
    expect(replaceCalls[0].sections).toEqual([]);
    expect(repository.categoryExists).not.toHaveBeenCalled();
  });

  it('rejects a category that does not exist without writing', async () => {
    const { service, replaceCalls, transaction } = makeHarness({
      categoryExists: false,
    });

    await expect(service.setSplit(EVENT_ID, body())).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.setSplit(EVENT_ID, body())).rejects.toThrow(
      'Категория не найдена',
    );
    expect(transaction).not.toHaveBeenCalled();
    expect(replaceCalls).toEqual([]);
  });

  it.each([
    ['a non-object body', null],
    ['an unknown gender', body({ gender: 'X' })],
    ['a non-UUID startId', body({ startId: 'nope' })],
    ['a zero formatId', body({ formatId: 0 })],
    ['a non-boolean enabled', body({ enabled: 'true' })],
    ['an empty enabled selection set', body({ sections: [] })],
    [
      'an unknown group id',
      body({ sections: [{ kind: 'BASE_GROUP', id: 'AGE_99' }] }),
    ],
    [
      'a duplicated selection',
      body({
        sections: [
          { kind: 'BASE_GROUP', id: 'AGE_41_50' },
          { kind: 'BASE_GROUP', id: 'AGE_41_50' },
        ],
      }),
    ],
  ])('rejects %s with 400 and no write', async (_label, payload) => {
    const { service, replaceCalls, transaction } = makeHarness();

    await expect(service.setSplit(EVENT_ID, payload)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(transaction).not.toHaveBeenCalled();
    expect(replaceCalls).toEqual([]);
  });

  it('writes the same stored set when the same payload is saved twice', async () => {
    const { service, replaceCalls } = makeHarness();
    const payload = body({
      sections: [
        { kind: 'BASE_GROUP', id: 'AGE_21_23' },
        { kind: 'PRESET', id: 'PRESET_MASTERS_41_PLUS' },
      ],
    });

    const first = await service.setSplit(EVENT_ID, payload);
    const second = await service.setSplit(EVENT_ID, payload);

    expect(first).toEqual(second);
    expect(replaceCalls[0].sections).toEqual(replaceCalls[1].sections);
    expect(replaceCalls[0].key).toEqual(replaceCalls[1].key);
  });
});
