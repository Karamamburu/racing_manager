import { UnauthorizedException } from '@nestjs/common';
import { UsersService } from './users.service';

function storedDbUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    authentikId: 'sub-1',
    userName: 'anna',
    email: 'anna@example.com',
    firstName: 'Анна',
    lastName: 'Смирнова',
    gender: 'F',
    birthDate: new Date('1996-04-12T00:00:00.000Z'),
    city: 'Москва',
    district: 'САО',
    team: 'СК Север',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('UsersService', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
  };
  const service = new UsersService(prisma as never);

  beforeEach(() => {
    prisma.user.findUnique.mockReset();
    prisma.user.update.mockReset();
    prisma.user.create.mockReset();
  });

  it('does not overwrite existing names on a later OIDC login', async () => {
    prisma.user.findUnique.mockResolvedValue(storedDbUser());
    prisma.user.update.mockResolvedValue(storedDbUser());

    await service.registerFromOidcProfile({
      sub: 'sub-1',
      username: 'anna',
      email: 'anna@example.com',
      name: 'Hacker Name',
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { authentikId: 'sub-1' },
      data: {
        userName: 'anna',
        email: 'anna@example.com',
      },
    });
  });

  it('updates the profile only by session authentik id', async () => {
    prisma.user.findUnique.mockResolvedValue(storedDbUser());
    prisma.user.update.mockResolvedValue(
      storedDbUser({ firstName: 'Мария', city: 'Тверь' }),
    );

    await expect(
      service.updateOwnProfile('sub-1', {
        firstName: 'Мария',
        lastName: 'Смирнова',
        gender: 'F',
        birthDate: new Date('1996-04-12T00:00:00.000Z'),
        city: 'Тверь',
        district: 'САО',
        team: 'СК Север',
      }),
    ).resolves.toMatchObject({
      firstName: 'Мария',
      city: 'Тверь',
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { authentikId: 'sub-1' },
      data: {
        firstName: 'Мария',
        lastName: 'Смирнова',
        gender: 'F',
        birthDate: new Date('1996-04-12T00:00:00.000Z'),
        city: 'Тверь',
        district: 'САО',
        team: 'СК Север',
      },
    });
  });

  it('rejects an update when the session user is missing in the database', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.updateOwnProfile('unknown-sub', {
        firstName: 'Анна',
        lastName: 'Смирнова',
        gender: null,
        birthDate: null,
        city: null,
        district: null,
        team: null,
      }),
    ).rejects.toThrow(UnauthorizedException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
