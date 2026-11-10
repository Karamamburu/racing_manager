import { BadRequestException } from '@nestjs/common';
import type { AgeCategory } from './age-groups';
import type { AgeSplitKey, AgeSplitRepository } from './age-split.repository';
import { AgeSplitService, type AgeCategoriesRef } from './age-split.service';
import type { PrismaService } from '../prisma/prisma.service';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const START_ID = '22222222-2222-4222-8222-222222222222';

const SENTINEL_TX = { sentinel: 'transaction' };

type ReplaceCategoriesCall = {
  db: unknown;
  key: AgeSplitKey;
  categories: AgeCategory[];
};

type HarnessOptions = {
  categoryExists?: boolean;
};

function makeHarness(options: HarnessOptions = {}) {
  const replaceCalls: ReplaceCategoriesCall[] = [];
  const repository = {
    categoryExists: jest.fn(() =>
      Promise.resolve(options.categoryExists ?? true),
    ),
    replaceCategories: jest.fn(
      (db: unknown, key: AgeSplitKey, categories: readonly AgeCategory[]) => {
        replaceCalls.push({ db, key, categories: [...categories] });
        return Promise.resolve();
      },
    ),
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
    categories: [{ groupIds: ['AGE_15_16'] }],
    ...overrides,
  };
}

describe('AgeSplitService.setSplit', () => {
  it('stores two categories numbered 1 and 2 with their group rows', async () => {
    const { service, replaceCalls, transaction } = makeHarness();

    const result = await service.setSplit(
      EVENT_ID,
      body({
        categories: [
          { groupIds: ['AGE_15_16', 'AGE_17_18'] },
          { groupIds: ['AGE_24_40'] },
        ],
      }),
    );

    expect(result).toEqual<AgeCategoriesRef>({
      startId: START_ID,
      formatId: 1,
      gender: 'M',
      enabled: true,
      categories: [
        {
          id: 'CATEGORY_1',
          number: 1,
          title: 'Возрастная категория 1',
          subtitle: '15–16, 17–18',
          groupIds: ['AGE_15_16', 'AGE_17_18'],
        },
        {
          id: 'CATEGORY_2',
          number: 2,
          title: 'Возрастная категория 2',
          subtitle: '24–40',
          groupIds: ['AGE_24_40'],
        },
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
    expect(replaceCalls[0].categories).toEqual([
      { number: 1, groupIds: ['AGE_15_16', 'AGE_17_18'] },
      { number: 2, groupIds: ['AGE_24_40'] },
    ]);
  });

  it('orders a category subtitle by age range regardless of input order', async () => {
    const { service, replaceCalls } = makeHarness();

    const result = await service.setSplit(
      EVENT_ID,
      body({ categories: [{ groupIds: ['AGE_17_18', 'AGE_15_16'] }] }),
    );

    expect(result.categories[0].subtitle).toBe('15–16, 17–18');
    expect(result.categories[0].groupIds).toEqual(['AGE_15_16', 'AGE_17_18']);
    expect(replaceCalls[0].categories).toEqual([
      { number: 1, groupIds: ['AGE_15_16', 'AGE_17_18'] },
    ]);
  });

  it('drops a category without groups and renumbers the remaining categories', async () => {
    const { service, replaceCalls } = makeHarness();

    const result = await service.setSplit(
      EVENT_ID,
      body({
        categories: [
          { groupIds: ['AGE_15_16'] },
          { groupIds: [] },
          { groupIds: ['AGE_24_40'] },
        ],
      }),
    );

    expect(result.categories).toEqual([
      {
        id: 'CATEGORY_1',
        number: 1,
        title: 'Возрастная категория 1',
        subtitle: '15–16',
        groupIds: ['AGE_15_16'],
      },
      {
        id: 'CATEGORY_2',
        number: 2,
        title: 'Возрастная категория 2',
        subtitle: '24–40',
        groupIds: ['AGE_24_40'],
      },
    ]);
    expect(replaceCalls[0].categories).toEqual([
      { number: 1, groupIds: ['AGE_15_16'] },
      { number: 2, groupIds: ['AGE_24_40'] },
    ]);
  });

  it('rejects an enabled save whose categories all lack groups without a transaction', async () => {
    const { service, replaceCalls, transaction } = makeHarness();

    await expect(
      service.setSplit(
        EVENT_ID,
        body({ categories: [{ groupIds: [] }, { groupIds: [] }] }),
      ),
    ).rejects.toThrow(
      new BadRequestException(
        'Нужна хотя бы одна возрастная категория с группой.',
      ),
    );
    expect(transaction).not.toHaveBeenCalled();
    expect(replaceCalls).toEqual([]);
  });

  it('clears stored rows and returns a disabled empty configuration', async () => {
    const { service, replaceCalls, repository, transaction } = makeHarness({
      categoryExists: false,
    });

    const result = await service.setSplit(
      EVENT_ID,
      body({ enabled: false, categories: [] }),
    );

    expect(result).toEqual<AgeCategoriesRef>({
      startId: START_ID,
      formatId: 1,
      gender: 'M',
      enabled: false,
      categories: [],
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(replaceCalls).toHaveLength(1);
    expect(replaceCalls[0].db).toBe(SENTINEL_TX);
    expect(replaceCalls[0].categories).toEqual([]);
    expect(repository.categoryExists).not.toHaveBeenCalled();
  });

  it('rejects a disabled save that still carries categories', async () => {
    const { service, replaceCalls, transaction } = makeHarness();

    await expect(
      service.setSplit(
        EVENT_ID,
        body({
          enabled: false,
          categories: [{ groupIds: ['AGE_15_16'] }],
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
    expect(replaceCalls).toEqual([]);
  });

  it('rejects an unknown protocol category before writing anything', async () => {
    const { service, replaceCalls, repository, transaction } = makeHarness({
      categoryExists: false,
    });

    await expect(service.setSplit(EVENT_ID, body())).rejects.toThrow(
      new BadRequestException('Категория не найдена на этом мероприятии.'),
    );
    expect(repository.categoryExists).toHaveBeenCalledWith(
      EVENT_ID,
      START_ID,
      1,
    );
    expect(transaction).not.toHaveBeenCalled();
    expect(replaceCalls).toEqual([]);
  });

  it('rejects a group that appears in two categories without writing', async () => {
    const { service, replaceCalls, transaction } = makeHarness();

    await expect(
      service.setSplit(
        EVENT_ID,
        body({
          categories: [
            { groupIds: ['AGE_41_50'] },
            { groupIds: ['AGE_41_50'] },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
    expect(replaceCalls).toEqual([]);
  });

  it('rejects the retired sections payload without writing', async () => {
    const { service, replaceCalls, transaction } = makeHarness();

    await expect(
      service.setSplit(
        EVENT_ID,
        body({ sections: [{ kind: 'BASE_GROUP', id: 'AGE_41_50' }] }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
    expect(replaceCalls).toEqual([]);
  });

  it.each([
    ['a non-object body', null],
    ['an unknown gender', body({ gender: 'X' })],
    ['a non-UUID startId', body({ startId: 'nope' })],
    ['a zero formatId', body({ formatId: 0 })],
    ['a non-boolean enabled', body({ enabled: 'true' })],
    [
      'a group repeated inside one category',
      body({ categories: [{ groupIds: ['AGE_41_50', 'AGE_41_50'] }] }),
    ],
    ['an unknown group id', body({ categories: [{ groupIds: ['AGE_99'] }] })],
    [
      'a category carrying a kind',
      body({ categories: [{ kind: 'PRESET', groupIds: ['AGE_41_50'] }] }),
    ],
  ])('rejects %s with 400 and no write', async (_label, payload) => {
    const { service, replaceCalls, transaction } = makeHarness();

    await expect(service.setSplit(EVENT_ID, payload)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(transaction).not.toHaveBeenCalled();
    expect(replaceCalls).toEqual([]);
  });

  it('writes the same rows and response when the same payload is saved twice', async () => {
    const { service, replaceCalls, transaction } = makeHarness();
    const payload = body({
      categories: [
        { groupIds: ['AGE_21_23'] },
        { groupIds: ['AGE_41_50', 'AGE_51_60', 'AGE_61_PLUS'] },
      ],
    });

    const first = await service.setSplit(EVENT_ID, payload);
    const second = await service.setSplit(EVENT_ID, payload);

    expect(first).toEqual(second);
    expect(replaceCalls).toHaveLength(2);
    expect(replaceCalls[0].categories).toEqual(replaceCalls[1].categories);
    expect(replaceCalls[0].key).toEqual(replaceCalls[1].key);
    expect(transaction).toHaveBeenCalledTimes(2);
  });
});
