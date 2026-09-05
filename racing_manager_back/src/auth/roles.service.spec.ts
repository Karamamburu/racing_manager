import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { RolesService } from './roles.service';
import { PrismaService } from '../prisma/prisma.service';
import { RoleCode } from './role-codes';

describe('RolesService', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
  };

  const service = new RolesService(prisma as unknown as PrismaService);

  beforeEach(() => {
    prisma.user.findUnique.mockReset();
  });

  it('returns an empty list when the user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.findCodesByAuthentikId('missing')).resolves.toEqual(
      [],
    );
  });

  it('maps role codes from the join table', async () => {
    prisma.user.findUnique.mockResolvedValue({
      userRoles: [
        { role: { code: RoleCode.ORGANIZER } },
        { role: { code: RoleCode.ADMINISTRATOR } },
      ],
    });

    await expect(service.findCodesByAuthentikId('sub-1')).resolves.toEqual([
      RoleCode.ORGANIZER,
      RoleCode.ADMINISTRATOR,
    ]);
  });

  it('checks whether any required role is present', async () => {
    prisma.user.findUnique.mockResolvedValue({
      userRoles: [{ role: { code: RoleCode.ORGANIZER } }],
    });

    await expect(
      service.userHasAnyRole('sub-1', [
        RoleCode.ADMINISTRATOR,
        RoleCode.ORGANIZER,
      ]),
    ).resolves.toBe(true);

    await expect(
      service.userHasAnyRole('sub-1', [RoleCode.ADMINISTRATOR]),
    ).resolves.toBe(false);
  });

  it('assertHasAnyRole rejects a missing identity', async () => {
    await expect(
      service.assertHasAnyRole(undefined, [RoleCode.ADMINISTRATOR]),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('assertHasAnyRole rejects a user without the required role', async () => {
    prisma.user.findUnique.mockResolvedValue({
      userRoles: [{ role: { code: RoleCode.ORGANIZER } }],
    });

    await expect(
      service.assertHasAnyRole('sub-1', [RoleCode.ADMINISTRATOR]),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('assertHasAnyRole allows a matching role', async () => {
    prisma.user.findUnique.mockResolvedValue({
      userRoles: [{ role: { code: RoleCode.ORGANIZER } }],
    });

    await expect(
      service.assertHasAnyRole('sub-1', [
        RoleCode.ADMINISTRATOR,
        RoleCode.ORGANIZER,
      ]),
    ).resolves.toBeUndefined();
  });

  it('assertAdminAccess allows organizer or administrator', async () => {
    prisma.user.findUnique.mockResolvedValue({
      userRoles: [{ role: { code: RoleCode.ORGANIZER } }],
    });

    await expect(service.assertAdminAccess('sub-1')).resolves.toBeUndefined();
  });
});
