import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The `roles` row of a role code is absent.
 *
 * The seed migration owns the three product roles; a missing row means the
 * database was never seeded, which no request can fix. The message names the
 * code so the operator sees which seed ran short.
 */
export class MissingSeededRoleError extends Error {
  readonly roleCode: string;

  constructor(roleCode: string) {
    super(
      `Role "${roleCode}" is missing from the roles table; the seed migration owns it.`,
    );
    this.name = 'MissingSeededRoleError';
    this.roleCode = roleCode;
  }
}

/**
 * Data access for the administrator-only REFEREE grant and removal.
 *
 * The role code is the stable identity here: the numeric `roles.id` never
 * leaves this file. Every call returns raw values or writes one row set and
 * holds no business rule — no caller role check, no existence decision, no
 * idempotency policy beyond the composite key the table already enforces.
 */
@Injectable()
export class RefereeRoleRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** The addressed user's id, or `null` when no user has it. */
  async findUserId(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    return user?.id ?? null;
  }

  /** Every role code the user currently holds. */
  async listRoleCodes(userId: string): Promise<string[]> {
    const rows = await this.prisma.userRole.findMany({
      where: { userId },
      select: { role: { select: { code: true } } },
    });

    return rows.map((row) => row.role.code);
  }

  /**
   * Adds one role to the user's set. The `(user_id, role_id)` primary key makes
   * a repeated add a no-op.
   */
  async addRole(userId: string, roleCode: string): Promise<void> {
    const roleId = await this.requireRoleId(roleCode);

    await this.prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId } },
      create: { userId, roleId },
      update: {},
    });
  }

  /**
   * Removes one role from the user's set and leaves the other rows alone. A
   * user who does not hold the role yields zero deleted rows, not an error.
   */
  async removeRole(userId: string, roleCode: string): Promise<void> {
    await this.prisma.userRole.deleteMany({
      where: { userId, role: { code: roleCode } },
    });
  }

  private async requireRoleId(roleCode: string): Promise<number> {
    const role = await this.prisma.role.findUnique({
      where: { code: roleCode },
      select: { id: true },
    });

    if (!role) throw new MissingSeededRoleError(roleCode);

    return role.id;
  }
}
