import { Injectable, NotFoundException } from '@nestjs/common';
import { RoleCode } from '../auth/role-codes';
import { RolesService } from '../auth/roles.service';
import type { SetRefereeRoleDto } from '../timing/timing.dto';
import type { UserRolesView } from '../timing/timing.views';
import { RefereeRoleRepository } from './referee-role.repository';

/**
 * The order roles appear in `UserRolesView`.
 *
 * The wire type is the existing role code set; ordering it here keeps the
 * response deterministic for the client without adding a role to it.
 */
const ROLE_VIEW_ORDER: readonly RoleCode[] = [
  RoleCode.ADMINISTRATOR,
  RoleCode.ORGANIZER,
  RoleCode.REFEREE,
];

/** Narrows stored role codes to the product roles the view declares. */
function toUserRoles(codes: readonly string[]): RoleCode[] {
  return ROLE_VIEW_ORDER.filter((code) => codes.includes(code));
}

/**
 * The administrator-only grant and removal of the global `REFEREE` role.
 *
 * `REFEREE` is added or removed as one row of the target user's role set; no
 * other role is written. Because the role set is read on every request, the
 * change holds for that user's next action, and ending a removed referee's
 * capture hold stays the timing module's lazy stale-holder rule. This service
 * therefore never calls the timing module.
 */
@Injectable()
export class RefereeRoleService {
  constructor(
    private readonly rolesService: RolesService,
    private readonly repository: RefereeRoleRepository,
  ) {}

  /**
   * Grants or removes `REFEREE` for one user.
   *
   * Only `ADMINISTRATOR` may call this, so the check names that one code rather
   * than the wider admin list. A repeated request leaves the role set as it is.
   *
   * @throws ForbiddenException when the caller is not an administrator.
   * @throws NotFoundException when no user has `userId`.
   */
  async setReferee(
    authentikId: string | undefined,
    userId: string,
    dto: SetRefereeRoleDto,
  ): Promise<UserRolesView> {
    await this.rolesService.assertHasAnyRole(authentikId, [
      RoleCode.ADMINISTRATOR,
    ]);

    const knownUserId = await this.repository.findUserId(userId);
    if (!knownUserId) {
      throw new NotFoundException(`User ${userId} does not exist.`);
    }

    if (dto.enabled) {
      await this.repository.addRole(userId, RoleCode.REFEREE);
    } else {
      await this.repository.removeRole(userId, RoleCode.REFEREE);
    }

    const codes = await this.repository.listRoleCodes(userId);

    return { userId, roles: toUserRoles(codes) };
  }
}
