import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RoleCode } from '../auth/role-codes';
import type { RolesService } from '../auth/roles.service';
import type { SetRefereeRoleDto } from '../timing/timing.dto';
import type { UserRolesView } from '../timing/timing.views';
import type { RefereeRoleRepository } from './referee-role.repository';
import { RefereeRoleService } from './referee-role.service';

/**
 * Unit tests for the administrator-only REFEREE grant and removal.
 *
 * Every repository call is a fake that holds the role set in memory: no Prisma,
 * no database, no HTTP. The rules under test are the role asserted for the
 * caller, the existence check, the single-role delta and the returned view.
 */

const ADMIN_AUTHENTIK_ID = 'authentik-admin';
const ORGANIZER_AUTHENTIK_ID = 'authentik-organizer';
const USER_ID = '6f1c1f9e-1a2b-4c3d-8e4f-5a6b7c8d9e0f';

type RepositoryFake = ReturnType<typeof createRepositoryFake>;

/**
 * A repository fake whose role set persists across calls, so a repeated grant
 * or removal proves the operation is idempotent rather than merely accepted.
 */
function createRepositoryFake() {
  let codes: string[] = [];
  return {
    findUserId: jest.fn<Promise<string | null>, [string]>(() =>
      Promise.resolve(USER_ID),
    ),
    listRoleCodes: jest.fn<Promise<string[]>, [string]>(() =>
      Promise.resolve([...codes]),
    ),
    addRole: jest.fn<Promise<void>, [string, string]>((_userId, code) => {
      if (!codes.includes(code)) codes.push(code);
      return Promise.resolve();
    }),
    removeRole: jest.fn<Promise<void>, [string, string]>((_userId, code) => {
      codes = codes.filter((held) => held !== code);
      return Promise.resolve();
    }),
    /** Puts the target user's stored role set where the next read finds it. */
    seedRoles(next: string[]): void {
      codes = [...next];
    },
  };
}

function createRolesFake() {
  return {
    assertHasAnyRole: jest.fn<
      Promise<void>,
      [string | undefined, readonly RoleCode[]]
    >(() => Promise.resolve()),
  };
}

function setRefereeDto(enabled: boolean): SetRefereeRoleDto {
  return { enabled };
}

describe('RefereeRoleService', () => {
  let repository: RepositoryFake;
  let roles: ReturnType<typeof createRolesFake>;
  let service: RefereeRoleService;

  beforeEach(() => {
    repository = createRepositoryFake();
    roles = createRolesFake();
    service = new RefereeRoleService(
      roles as unknown as RolesService,
      repository as unknown as RefereeRoleRepository,
    );
  });

  describe('setReferee', () => {
    it('asserts ADMINISTRATOR only, never the wider admin role list', async () => {
      repository.seedRoles([RoleCode.ORGANIZER]);

      await service.setReferee(
        ADMIN_AUTHENTIK_ID,
        USER_ID,
        setRefereeDto(true),
      );

      expect(roles.assertHasAnyRole).toHaveBeenCalledTimes(1);
      expect(roles.assertHasAnyRole).toHaveBeenCalledWith(ADMIN_AUTHENTIK_ID, [
        RoleCode.ADMINISTRATOR,
      ]);
    });

    it('grants REFEREE and keeps ORGANIZER', async () => {
      repository.seedRoles([RoleCode.ORGANIZER]);

      const view = await service.setReferee(
        ADMIN_AUTHENTIK_ID,
        USER_ID,
        setRefereeDto(true),
      );

      expect(repository.addRole).toHaveBeenCalledWith(
        USER_ID,
        RoleCode.REFEREE,
      );
      expect(repository.removeRole).not.toHaveBeenCalled();
      expect(view.roles).toEqual([RoleCode.ORGANIZER, RoleCode.REFEREE]);
    });

    it('grants REFEREE idempotently on a user who already holds it', async () => {
      repository.seedRoles([RoleCode.ORGANIZER, RoleCode.REFEREE]);

      const first = await service.setReferee(
        ADMIN_AUTHENTIK_ID,
        USER_ID,
        setRefereeDto(true),
      );
      const second = await service.setReferee(
        ADMIN_AUTHENTIK_ID,
        USER_ID,
        setRefereeDto(true),
      );

      expect(first).toEqual(second);
      expect(second.roles).toEqual([RoleCode.ORGANIZER, RoleCode.REFEREE]);
    });

    it('removes only REFEREE and keeps ORGANIZER', async () => {
      repository.seedRoles([
        RoleCode.ADMINISTRATOR,
        RoleCode.ORGANIZER,
        RoleCode.REFEREE,
      ]);

      const view = await service.setReferee(
        ADMIN_AUTHENTIK_ID,
        USER_ID,
        setRefereeDto(false),
      );

      expect(repository.removeRole).toHaveBeenCalledWith(
        USER_ID,
        RoleCode.REFEREE,
      );
      expect(repository.addRole).not.toHaveBeenCalled();
      expect(view.roles).toEqual([RoleCode.ADMINISTRATOR, RoleCode.ORGANIZER]);
    });

    it('removes REFEREE idempotently from a user who does not hold it', async () => {
      repository.seedRoles([RoleCode.ORGANIZER]);

      const view = await service.setReferee(
        ADMIN_AUTHENTIK_ID,
        USER_ID,
        setRefereeDto(false),
      );

      expect(view.roles).toEqual([RoleCode.ORGANIZER]);
    });

    it('answers 404 for an unknown target user and changes no role', async () => {
      repository.findUserId.mockResolvedValue(null);
      repository.seedRoles([RoleCode.ORGANIZER]);

      await expect(
        service.setReferee(ADMIN_AUTHENTIK_ID, USER_ID, setRefereeDto(true)),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(repository.addRole).not.toHaveBeenCalled();
      expect(repository.removeRole).not.toHaveBeenCalled();
    });

    it('refuses a caller without ADMINISTRATOR and changes no role', async () => {
      roles.assertHasAnyRole.mockRejectedValue(
        new ForbiddenException('Insufficient role.'),
      );

      await expect(
        service.setReferee(
          ORGANIZER_AUTHENTIK_ID,
          USER_ID,
          setRefereeDto(true),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(repository.findUserId).not.toHaveBeenCalled();
      expect(repository.addRole).not.toHaveBeenCalled();
      expect(repository.removeRole).not.toHaveBeenCalled();
    });

    it('returns the documented view shape for the addressed user', async () => {
      repository.seedRoles([RoleCode.ORGANIZER]);

      const view: UserRolesView = await service.setReferee(
        ADMIN_AUTHENTIK_ID,
        USER_ID,
        setRefereeDto(true),
      );

      expect(Object.keys(view).sort()).toEqual(['roles', 'userId']);
      expect(view.userId).toBe(USER_ID);
      expect(view.roles.every((code) => typeof code === 'string')).toBe(true);
    });
  });
});
