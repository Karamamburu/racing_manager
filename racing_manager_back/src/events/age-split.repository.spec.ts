import { Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { AgeSplitCategoryNotFoundError } from './age-split.errors';
import { AgeSplitKey, AgeSplitRepository } from './age-split.repository';

const KEY: AgeSplitKey = {
  eventId: '11111111-1111-4111-8111-111111111111',
  startId: '22222222-2222-4222-8222-222222222222',
  formatId: 1,
  gender: 'M',
};

function constraintError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('constraint failed', {
    code,
    clientVersion: 'test',
  });
}

function makeRepository() {
  const db = {
    start: { findFirst: jest.fn(() => Promise.resolve({ id: KEY.startId })) },
    ageSplitCategory: {
      deleteMany: jest.fn(() => Promise.resolve({ count: 0 })),
      createMany: jest.fn(() => Promise.resolve({ count: 0 })),
    },
    ageSplitSection: {
      deleteMany: jest.fn(() => Promise.resolve({ count: 0 })),
    },
  };
  // A repository instance is still needed for the Prisma-owning read helpers;
  // these tests prove the write path uses the client it is handed.
  const prisma = {} as PrismaService;
  return { repository: new AgeSplitRepository(prisma), db };
}

describe('AgeSplitRepository write path', () => {
  it('reads the protocol-category link through the handed transaction client', async () => {
    const { repository, db } = makeRepository();

    await expect(
      repository.categoryExists(db as never, KEY.eventId, KEY.startId, 1),
    ).resolves.toBe(true);
    expect(db.start.findFirst).toHaveBeenCalledWith({
      where: {
        id: KEY.startId,
        eventId: KEY.eventId,
        formats: { some: { formatId: 1 } },
      },
      select: { id: true },
    });
  });

  it('answers the not-found domain error for a foreign-key constraint failure', async () => {
    const { repository, db } = makeRepository();
    db.ageSplitCategory.createMany.mockImplementationOnce(() =>
      Promise.reject(constraintError('P2003')),
    );

    await expect(
      repository.replaceCategories(db as never, KEY, [
        { number: 1, groupIds: ['AGE_15_16'] },
      ]),
    ).rejects.toBeInstanceOf(AgeSplitCategoryNotFoundError);
  });

  it('keeps an unrelated write failure unhandled', async () => {
    const { repository, db } = makeRepository();
    const failure = new Error('connection lost');
    db.ageSplitCategory.deleteMany.mockImplementationOnce(() =>
      Promise.reject(failure),
    );

    await expect(
      repository.replaceCategories(db as never, KEY, []),
    ).rejects.toBe(failure);
  });
});
