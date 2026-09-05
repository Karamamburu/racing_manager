import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { RolesService } from './roles.service';
import { RoleCode } from './role-codes';

describe('RolesGuard', () => {
  const rolesService = {
    assertHasAnyRole: jest.fn(),
  };
  const reflector = {
    getAllAndOverride: jest.fn(),
  };

  const guard = new RolesGuard(
    reflector as unknown as Reflector,
    rolesService as unknown as RolesService,
  );

  const contextWithSub = (sub?: string) =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          session: sub ? { userSub: sub } : {},
        }),
      }),
    }) as never;

  beforeEach(() => {
    rolesService.assertHasAnyRole.mockReset();
    reflector.getAllAndOverride.mockReset();
  });

  it('allows when no roles are required', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    await expect(guard.canActivate(contextWithSub())).resolves.toBe(true);
    expect(rolesService.assertHasAnyRole).not.toHaveBeenCalled();
  });

  it('delegates an unauthenticated check to assertHasAnyRole', async () => {
    reflector.getAllAndOverride.mockReturnValue([RoleCode.ADMINISTRATOR]);
    rolesService.assertHasAnyRole.mockRejectedValue(
      new UnauthorizedException(),
    );

    await expect(guard.canActivate(contextWithSub())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(rolesService.assertHasAnyRole).toHaveBeenCalledWith(undefined, [
      RoleCode.ADMINISTRATOR,
    ]);
  });

  it('rejects authenticated users without the required role', async () => {
    reflector.getAllAndOverride.mockReturnValue([RoleCode.ADMINISTRATOR]);
    rolesService.assertHasAnyRole.mockRejectedValue(new ForbiddenException());

    await expect(
      guard.canActivate(contextWithSub('sub-1')),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(rolesService.assertHasAnyRole).toHaveBeenCalledWith('sub-1', [
      RoleCode.ADMINISTRATOR,
    ]);
  });

  it('allows authenticated users with a matching role', async () => {
    reflector.getAllAndOverride.mockReturnValue([
      RoleCode.ADMINISTRATOR,
      RoleCode.ORGANIZER,
    ]);
    rolesService.assertHasAnyRole.mockResolvedValue(undefined);

    await expect(guard.canActivate(contextWithSub('sub-1'))).resolves.toBe(
      true,
    );
  });
});
